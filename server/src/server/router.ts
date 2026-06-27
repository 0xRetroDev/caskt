import { type IncomingMessage, type ServerResponse } from "node:http";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: Method;
  segments: string[];
  handler: Handler;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Compact router: register routes, then feed it node:http requests. */
export class Router {
  private routes: Route[] = [];

  add(method: Method, path: string, handler: Handler): this {
    this.routes.push({ method, segments: path.split("/").filter(Boolean), handler });
    return this;
  }
  get(path: string, h: Handler) {
    return this.add("GET", path, h);
  }
  post(path: string, h: Handler) {
    return this.add("POST", path, h);
  }
  put(path: string, h: Handler) {
    return this.add("PUT", path, h);
  }
  delete(path: string, h: Handler) {
    return this.add("DELETE", path, h);
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Permissive CORS for a local UI dev server on another port.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.split("/").filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const params = matchPath(route.segments, path);
      if (!params) continue;
      try {
        const body = req.method === "POST" || req.method === "PUT" ? await readJson(req) : undefined;
        const result = await route.handler({ params, query: url.searchParams, body });
        send(res, 200, result);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        send(res, status, { error: err instanceof Error ? err.message : "error" });
      }
      return;
    }
    send(res, 404, { error: "not found" });
  }
}

function matchPath(routeSegs: string[], pathSegs: string[]): Record<string, string> | null {
  if (routeSegs.length !== pathSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i]!;
    const p = pathSegs[i]!;
    if (r.startsWith(":")) params[r.slice(1)] = decodeURIComponent(p);
    else if (r !== p) return null;
  }
  return params;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new HttpError(413, "body too large"));
    });
    req.on("end", () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, "invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body ?? null);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}
