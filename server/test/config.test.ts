import test from "node:test";
import assert from "node:assert/strict";
import { mergeServerConfig, SERVER_DEFAULTS } from "../src/server/config.js";

test("mergeServerConfig: undefined port does not clobber the default", () => {
  const cfg = mergeServerConfig({ refreshToken: "x", port: undefined });
  assert.equal(cfg.port, SERVER_DEFAULTS.port);
  assert.equal(cfg.host, SERVER_DEFAULTS.host);
});

test("mergeServerConfig: an explicit port wins", () => {
  const cfg = mergeServerConfig({ refreshToken: "x", port: 9000 });
  assert.equal(cfg.port, 9000);
});

test("mergeServerConfig: other undefined options keep their defaults", () => {
  const cfg = mergeServerConfig({
    refreshToken: "x",
    opDelayMs: undefined,
    autoConnect: undefined,
  });
  assert.equal(cfg.opDelayMs, SERVER_DEFAULTS.opDelayMs);
  assert.equal(cfg.autoConnect, SERVER_DEFAULTS.autoConnect);
});
