import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * Serve a built single-page app from `root`, falling back to index.html so
 * client-side routes resolve. Returns false if there is nothing to serve, so
 * the caller can 404.
 */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): boolean {
  if (!existsSync(root)) return false;

  const url = new URL(req.url ?? "/", "http://localhost");
  // Block path traversal: resolve under root and verify containment.
  const requested = normalize(join(root, decodeURIComponent(url.pathname)));
  const file = requested.startsWith(root) && isFile(requested) ? requested : join(root, "index.html");
  if (!isFile(file)) return false;

  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
  return true;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
