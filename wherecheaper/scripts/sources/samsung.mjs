// Reads prices from Samsung's online store in each country.
// Samsung's "buy" pages publish schema.org JSON-LD: a ProductGroup whose
// variants are named like "Galaxy S26 Ultra 1TB | 16GB Pink Gold", each with a
// price. Some pages hold sibling models too (India's S26 page includes the S26+
// and S26 FE), so we keep only variants whose name is this product plus a storage size.

import { NotSold, fetchPage, jsonLdPrices, pickBase, storageVariants, variantPattern } from "./util.mjs";

export const SAMSUNG_STORES = {
  US: "https://www.samsung.com/us",
  CA: "https://www.samsung.com/ca",
  UK: "https://www.samsung.com/uk",
  DE: "https://www.samsung.com/de",
  IN: "https://www.samsung.com/in",
  AE: "https://www.samsung.com/ae",
  SG: "https://www.samsung.com/sg",
  JP: "https://www.samsung.com/jp",
  KR: "https://www.samsung.com/sec",
  CN: "https://www.samsung.com.cn",
  HK: "https://www.samsung.com/hk_en",
  AU: "https://www.samsung.com/au",
};

/**
 * @param {string} country  key of SAMSUNG_STORES
 * @param {{page: string, match?: string}} src  page is the path after the country prefix, e.g. "smartphones/galaxy-s26-ultra/buy/"
 * @param {number} expected expected local price (US price × exchange rate)
 * @param {string} productName
 */
export async function samsungPrice(country, src, expected, productName) {
  const page = src.page;
  const base = SAMSUNG_STORES[country];
  if (!base) throw new NotSold(`no Samsung store for ${country}`);
  const url = `${base}/${page}`;
  // A redirect away from the product (to a category or home page) means it isn't sold there.
  const wanted = "/" + page.replace(/^\/|\/$/g, "");
  const html = await fetchPage(url, (got) => got.pathname.replace(/\/$/, "").endsWith(wanted));
  const byStorage = storageVariants(jsonLdVariants(html), variantPattern(src, productName), expected);
  if (byStorage) return { ...byStorage, url };

  // No named variants (some countries use another naming scheme): lowest price in range.
  const prices = jsonLdPrices(html);
  if (!prices.length) throw new Error(`no price data on ${url}`);
  const amount = pickBase(prices, expected);
  if (!amount) throw new Error(`no price near ${Math.round(expected)} on ${url} (saw ${[...new Set(prices)].slice(0, 6)})`);
  return { amount, url };
}

function walk(node, visit) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}

function jsonLdVariants(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      walk(JSON.parse(m[1]), (o) => {
        if (o["@type"] !== "Product" || typeof o.name !== "string" || !o.offers) return;
        for (const offer of [].concat(o.offers)) out.push({ name: o.name, price: Number(offer.price) });
      });
    } catch {
      // Not every block is valid JSON; skip it.
    }
  }
  return out;
}
