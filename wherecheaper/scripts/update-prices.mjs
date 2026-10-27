// Refreshes data/prices.json from the product catalog.
//   npm run update-prices
// Apple, Samsung and Google products are read from each brand's official store
// in every country; manual products copy the prices typed into data/catalog.json. When a fetch fails, the last
// known price is kept and marked stale, so one bad run never blanks the site.

import { readFile, writeFile } from "node:fs/promises";
import { appleListingPrice, applePrice } from "./sources/apple.mjs";
import { googlePrice } from "./sources/google.mjs";
import { samsungPrice } from "./sources/samsung.mjs";
import { NotSold } from "./sources/util.mjs";

const READERS = {
  apple: (cc, src, expected, name) =>
    src.list ? appleListingPrice(cc, src.list, src.name, expected) : applePrice(cc, src, expected, name),
  samsung: (cc, src, expected, name) => samsungPrice(cc, src, expected, name),
  google: (cc, src, expected) => googlePrice(cc, src, expected),
};

const root = new URL("../", import.meta.url);
const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(new URL(p, root), "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
};

const countries = await readJson("data/countries.json");
const { products } = await readJson("data/catalog.json");
const previous = await readJson("data/prices.json", { products: {} });

async function usdRates() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  const body = await res.json();
  if (body.result !== "success") throw new Error("exchange rate API failed");
  return body.rates;
}

// Run tasks with a small concurrency limit so we don't hammer the store.
async function pool(tasks, limit = 4) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    }),
  );
  return results;
}

const rates = await usdRates();
const now = new Date().toISOString();
const out = { generatedAt: now, products: {} };
const log = { ok: 0, stale: 0, unavailable: 0, failed: [] };

for (const p of products) out.products[p.id] = {};

const tasks = [];
for (const p of products) {
  if (p.source.type === "manual") {
    for (const [cc, amount] of Object.entries(p.prices)) {
      out.products[p.id][cc] = { amount, checkedAt: p.source.checkedAt, status: "manual" };
    }
    continue;
  }
  const read = READERS[p.source.type];
  if (!read) throw new Error(`unknown source type "${p.source.type}" for ${p.id}`);
  for (const [cc, c] of Object.entries(countries)) {
    tasks.push(async () => {
      const expected = p.source.usPrice * rates[c.currency];
      try {
        const { amount, url, variants } = await read(cc, p.source, expected, p.name);
        out.products[p.id][cc] = { amount, ...(variants && { variants }), url, checkedAt: now, status: "ok" };
        log.ok++;
      } catch (err) {
        const prev = previous.products?.[p.id]?.[cc];
        if (err instanceof NotSold) {
          log.unavailable++;
        } else if (prev) {
          out.products[p.id][cc] = { ...prev, status: "stale" };
          log.stale++;
          log.failed.push(`${p.id} ${cc}: ${err.message}`);
        } else {
          log.failed.push(`${p.id} ${cc}: ${err.message}`);
        }
      }
    });
  }
}

await pool(tasks);
await writeFile(new URL("data/prices.json", root), JSON.stringify(out, null, 2) + "\n");

console.log(`Updated ${log.ok} prices, kept ${log.stale} stale, ${log.unavailable} not sold.`);
for (const line of log.failed) console.warn("  ! " + line);

// Fail the scheduled job when most lookups broke; Apple probably changed its pages.
if (log.failed.length > tasks.length / 2) {
  console.error("More than half of the lookups failed. A store probably changed its pages; check scripts/sources/.");
  process.exit(1);
}
