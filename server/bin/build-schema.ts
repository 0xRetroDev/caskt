#!/usr/bin/env node
// Optional manual generation; the server does this automatically on startup.
import { buildSchema } from "../src/server/data/sources.js";
console.log("Building schema.json and images.json...");
await buildSchema(".");
console.log("Done.");
