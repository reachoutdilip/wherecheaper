// Reads starting prices from Apple's online store in each country.
//
// Each model's configurator page (e.g. /jp/shop/buy-iphone/iphone-18-pro) embeds
// a list of configurations such as
//   "price":{"fullPrice":219800.00},"category":"iphone","name":"iPhone 18 Pro 256GB Silver"
// from which we read a price per storage size. Pages without that list (Macs)
// fall back to the lowest numeric price near the expected one: the base model.
// We read numeric fields, never formatted strings, so locale formatting doesn't matter.

import { NotSold, fetchPage, pickBase, sleep, storageVariants, variantPattern } from "./util.mjs";

export const APPLE_STORES = {
  US: "https://www.apple.com",
  CA: "https://www.apple.com/ca",
  UK: "https://www.apple.com/uk",
  DE: "https://www.apple.com/de",
  IN: "https://www.apple.com/in",
  AE: "https://www.apple.com/ae",
  SG: "https://www.apple.com/sg",
  JP: "https://www.apple.com/jp",
  KR: "https://www.apple.com/kr",
  CN: "https://www.apple.com.cn",
  HK: "https://www.apple.com/hk",
  AU: "https://www.apple.com/au",
};

export function extractConfigs(html) {
  return [...html.matchAll(/"price":\{"fullPrice":([\d.]+)\},"category":"\w+","name":"([^"]+)"/g)].map((m) => ({
    name: m[2],
    price: Number(m[1]),
  }));
}

export function extractPrices(html) {
  const re = /"raw_amount":"([\d.]+)"|"raw":\{"price":"([\d.]+)"/g;
  return [...html.matchAll(re)].map((m) => Number(m[1] ?? m[2])).filter((n) => n > 0);
}

/**
 * @param {string} country  key of APPLE_STORES
 * @param {{page: string, match?: string}} src  page is the path under /shop/, e.g. "buy-iphone/iphone-18-pro"
 * @param {number} expected expected local price (US price × exchange rate)
 * @param {string} productName
 */
export async function applePrice(country, src, expected, productName) {
  const base = APPLE_STORES[country];
  if (!base) throw new NotSold(`no Apple store for ${country}`);
  const url = `${base}/shop/${src.page}`;
  const pattern = variantPattern(src, productName);

  // The page sometimes arrives without price data; retry a couple of times.
  for (let i = 0; i < 3; i++) {
    const html = await fetchPage(url);
    const byStorage = storageVariants(extractConfigs(html), pattern, expected);
    if (byStorage) return { ...byStorage, url };
    if (!src.match) {
      const amount = pickBase(extractPrices(html), expected);
      if (amount) return { amount, url };
    }
    await sleep(1500);
  }
  throw new Error(`no price near ${Math.round(expected)} on ${url}`);
}

function walk(node, visit) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}

/**
 * Accessories such as AirPods have no configurator page; the category listing
 * (e.g. /shop/accessories/all/headphones-speakers) publishes JSON-LD with one
 * Product per item. Names stay in English across countries, with a colour
 * suffix such as "AirPods Max 2 - Midnight".
 */
export async function appleListingPrice(country, list, name, expected) {
  const base = APPLE_STORES[country];
  if (!base) throw new NotSold(`no Apple store for ${country}`);
  const url = `${base}/shop/${list}`;
  // Some countries use non-breaking spaces inside names ("AirPods 5").
  const matches = (raw) => {
    const n = raw.replace(/\s+/g, " ").trim();
    return n === name || (n.startsWith(name + " ") && /^ [-–—]/.test(n.slice(name.length)));
  };

  // The listing doesn't always include every product; retry a few times.
  for (let i = 0; i < 4; i++) {
    const html = await fetchPage(url);
    const prices = [];
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        walk(JSON.parse(m[1]), (o) => {
          if (o["@type"] === "Product" && typeof o.name === "string" && matches(o.name)) {
            for (const offer of [].concat(o.offers ?? [])) prices.push(Number(offer.price));
          }
        });
      } catch {
        // Not every block is valid JSON; skip it.
      }
    }
    const amount = pickBase(prices.filter((p) => p > 0), expected);
    if (amount) return { amount, url };
    await sleep(2000);
  }
  throw new Error(`${name} not listed near ${Math.round(expected)} on ${url}`);
}
