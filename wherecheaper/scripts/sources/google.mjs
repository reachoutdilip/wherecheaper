// Reads prices from the Google Store in each country.
// The Google Store has no structured price data; prices only appear as text
// such as "From £1,079", "Ab 1.199 €" or "￥174,800 より". Phones are read from
// their configuration page, which lists a price per storage size; other
// products from the headline price on the product page.

import { BAND, NotSold, fetchPage, normName, normStorage, pickBase, textPrices } from "./util.mjs";

// Countries where the Google Store sells hardware. Elsewhere it redirects to a region picker.
export const GOOGLE_STORES = { US: "us", CA: "ca", UK: "gb", DE: "de", IN: "in", SG: "sg", JP: "jp", AU: "au" };

/**
 * @param {string} country  key of GOOGLE_STORES
 * @param {{page: string}} src  page is the product slug, e.g. "pixel_11_pro"
 * @param {number} expected expected local price (US price × exchange rate)
 */
export async function googlePrice(country, src, expected) {
  const page = src.page;
  const cc = GOOGLE_STORES[country];
  if (!cc) throw new NotSold(`no Google Store in ${country}`);
  const url = `https://store.google.com/${cc}/product/${page}`;

  // Phones have a configuration page listing every storage size with its price:
  //   data-test="storage_selection_panel">256GB | 12GB RAM<div … data-test-price>From $1,099</div>
  try {
    const config = await fetchPage(`https://store.google.com/${cc}/config/${page}`, (got) => got.pathname.endsWith(`/config/${page}`));
    const variants = {};
    for (const m of config.matchAll(/data-test="storage_selection_panel">([^<|]+)[^<]*<div[^>]*data-test-price>([^<]+)<\/div>/g)) {
      const storage = normStorage(normName(m[1]));
      const [price] = textPrices(m[2]);
      if (storage && price) variants[storage] = Math.min(variants[storage] ?? Infinity, price);
    }
    const prices = Object.values(variants);
    const amount = prices.length ? Math.min(...prices) : 0;
    if (amount >= expected * BAND.low && amount <= expected * BAND.high) return { amount, variants, url };
  } catch {
    // No configuration page, or it failed to load: use the product page.
  }

  // Otherwise (earbuds, or no config page) read the product page's headline price.
  const html = await fetchPage(url, (got) => got.pathname.replace(/\/$/, "").endsWith(`/product/${page}`));
  const amount = pickBase(headlinePrices(html), expected);
  if (!amount) throw new Error(`no price near ${Math.round(expected)} on ${url}`);
  return { amount, url };
}

// The page is full of other amounts ("Save $200", trade-in credit, monthly
// instalments), so we only read the headline price, in order of preference:
//   1. "From $549" followed by a struck-through "$1,099": the struck price is
//      the list price, the "From" price assumes a trade-in.
//   2. "From £1,079" / "Ab 1.199 €" / "￥174,800 より" on its own.
//   3. India shows "From ₹6,916/mo … or ₹89,999 <s>₹95,999</s>": the struck
//      price if any, else the "or" price.
//   4. Every amount on the page.
function headlinePrices(html) {
  const out = [];
  for (const m of html.matchAll(/\[null,"([^"\[\]]{0,40})"\],\[\[null,"([^"\[\]]{1,20})"\]/g)) {
    if (isHeadline(m[1])) out.push(...textPrices(m[2]));
  }
  if (out.length) return out;
  for (const m of html.matchAll(/\[null,"([^"\[\]]{0,40})"\]/g)) {
    if (isHeadline(m[1])) out.push(...textPrices(m[1]));
  }
  if (out.length) return out;
  for (const m of html.matchAll(/ or ([^\s<]{2,20})\s*(?:<span[^>]*>\s*<s[^>]*>([^<]{1,20})<\/s>)?/g)) {
    out.push(...textPrices(m[2] ?? m[1]));
  }
  if (out.length) return out;
  // Single-price products (earbuds, accessories) show a bare price with no
  // "From"; the band around the expected price does the filtering there.
  return textPrices(html);
}

function isHeadline(s) {
  return /^(From |Ab |Starting at )|より$/.test(s) && !/\/mo|月額|%/.test(s);
}
