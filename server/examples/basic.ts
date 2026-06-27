// Example: end-to-end usage. Run with your own refresh token in the env.
//   STEAM_REFRESH_TOKEN=... npx tsx examples/basic.ts
import { Inventory, SchemaResolver } from "../src/index.js";

const refreshToken = process.env["STEAM_REFRESH_TOKEN"];
if (!refreshToken) throw new Error("set STEAM_REFRESH_TOKEN");

// Bring your own price source. This stub returns null (everything unpriced);
// swap in cs2.sh, Steam, Pricempire, etc. Caching is your concern, not the library's.
const priceProvider = async (_name: string): Promise<number | null> => null;

const inv = new Inventory({
  refreshToken,
  priceProvider,
  // nameResolver: SchemaResolver.fromFile("schema.json"),
  opDelayMs: 1500,
});

await inv.connect();

const report = await inv.sync();
console.log(`indexed ${report.totalItems} items across ${report.unitsCrawled} storage units`);

// Where did I put that low-float knife?
for (const knife of inv.search({ weapon: "Karambit", floatMax: 0.02 })) {
  console.log(knife.name, knife.float, "->", knife.location);
}

// Real net worth including everything asleep in storage.
console.log(inv.value());

// Preview a tidy-up without touching anything.
const plan = await inv.organize(
  [{ when: { priceMax: 5 }, to: inv.units()[0]?.casketId ?? "" }],
  { dryRun: true },
);
console.log(`would move ${plan.planned.length}, skip ${plan.skipped.length}`);

inv.disconnect();
