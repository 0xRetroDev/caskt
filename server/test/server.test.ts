import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parseMoney, staticProvider, cachingProvider, rateLimited } from "../src/server/pricing.js";
import { Jobs } from "../src/server/jobs.js";
import { Router } from "../src/server/router.js";

test("parseMoney: handles $ and € formats", () => {
  assert.equal(parseMoney("$12.34"), 12.34);
  assert.equal(parseMoney("12,34€"), 12.34);
  assert.equal(parseMoney("1.234,56 €"), 1234.56);
  assert.equal(parseMoney("1,234.56"), 1234.56);
  assert.equal(parseMoney(undefined), null);
  assert.equal(parseMoney("--"), null);
});

test("cachingProvider: caches and de-dupes in-flight calls", async () => {
  let calls = 0;
  const slow = async (_name: string) => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return 5;
  };
  const cached = cachingProvider(slow, 10_000);
  const [a, b] = await Promise.all([cached("x"), cached("x")]); // one in-flight
  const c = await cached("x"); // cached
  assert.equal(a, 5);
  assert.equal(b, 5);
  assert.equal(c, 5);
  assert.equal(calls, 1);
});

test("rateLimited: serializes calls with a minimum interval", async () => {
  const provider = rateLimited(staticProvider({ a: 1, b: 2, c: 3 }), 30);
  const start = Date.now();
  const results = await Promise.all([provider("a"), provider("b"), provider("c")]);
  assert.deepEqual(results, [1, 2, 3]);
  assert.ok(Date.now() - start >= 60, "should wait between calls");
});

test("Jobs: runs to completion with result and progress", async () => {
  const jobs = new Jobs();
  const id = jobs.start("demo", async (progress) => {
    progress(1, 2);
    progress(2, 2);
    return { ok: true };
  });
  await new Promise((r) => setTimeout(r, 10));
  const job = jobs.get(id)!;
  assert.equal(job.status, "done");
  assert.deepEqual(job.progress, { done: 2, total: 2 });
  assert.deepEqual(job.result, { ok: true });
});

test("Jobs: captures errors", async () => {
  const jobs = new Jobs();
  const id = jobs.start("boom", async () => {
    throw new Error("nope");
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(jobs.get(id)!.status, "error");
  assert.equal(jobs.get(id)!.error, "nope");
});

test("Router: params, JSON body, and 404 over real http", async () => {
  const router = new Router();
  router.get("units/:id/contents", ({ params }) => ({ id: params["id"] }));
  router.post("move", ({ body }) => ({ echo: body }));

  const http = createServer((req, res) => void router.handle(req, res));
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const got = await (await fetch(`${base}/units/abc/contents`)).json();
  assert.deepEqual(got, { id: "abc" });

  const posted = await (
    await fetch(`${base}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "bulk" }),
    })
  ).json();
  assert.deepEqual(posted, { echo: { to: "bulk" } });

  const missing = await fetch(`${base}/nope`);
  assert.equal(missing.status, 404);

  await new Promise<void>((r) => http.close(() => r()));
});
