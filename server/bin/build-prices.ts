#!/usr/bin/env node
// Optional manual generation; the server does this automatically on startup.
import { buildPrices } from "../src/server/data/sources.js";
console.log("Building prices.json...");
await buildPrices(".");
console.log("Done.");
