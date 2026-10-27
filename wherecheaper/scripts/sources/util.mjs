// Shared helpers for the store readers.

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Local prices differ from the converted US price because of VAT, import
// duties and pricing strategy; in practice they land within this range.
// Anything outside it is an accessory, a monthly instalment or a trade-in deal.
export const BAND = { low: 0.8, high: 1.9 };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class NotSold extends Error {}

/**
 * Fetches a store page, retrying transient failures.
 * @param {string} url
 * @param {(finalUrl: URL, wanted: URL) => boolean} [isRedirectOk] return false to treat a redirect as "not sold"
 */
export async function fetchPage(url, isRedirectOk = (a, b) => a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.8" },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) throw new NotSold(`not sold (404) at ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (!isRedirectOk(new URL(res.url), new URL(url))) throw new NotSold(`not sold (redirected to ${res.url})`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (err instanceof NotSold) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

/** "256 GB", "1 TB", "1TB" → "256GB", "1TB" */
export function normStorage(s) {
  const m = s.replace(/\s+/g, "").toUpperCase().match(/^(\d+)(GB|TB)$/);
  return m ? m[1] + m[2] : null;
}

/** Tidies names: non-breaking spaces and hyphens become plain ones. */
export function normName(s) {
  return s.replace(/[   \s]+/g, " ").replace(/[‐‑]/g, "-").trim();
}

/**
 * Turns [{name, price}] configurations into per-storage prices.
 * `pattern` must capture the storage, e.g. /^iPhone 18 Pro (\d+ ?[GT]B)\b/i.
 * Returns null when nothing matched; prices outside the band are ignored.
 * @returns {{amount:number, variants:Record<string,number>} | null}
 */
export function storageVariants(configs, pattern, expected) {
  const variants = {};
  for (const { name, price } of configs) {
    const m = normName(name).match(pattern);
    const storage = m && normStorage(m[1]);
    if (!storage || !(price > 0)) continue;
    variants[storage] = Math.min(variants[storage] ?? Infinity, price);
  }
  const prices = Object.values(variants);
  if (!prices.length) return null;
  const amount = Math.min(...prices);
  // The base configuration must still look like this product, not an accessory or a cheaper sibling.
  if (amount < expected * BAND.low || amount > expected * BAND.high) return null;
  return { amount, variants: sortStorage(variants) };
}

const storageGB = (s) => parseInt(s, 10) * (s.endsWith("TB") ? 1024 : 1);
function sortStorage(v) {
  return Object.fromEntries(Object.entries(v).sort((a, b) => storageGB(a[0]) - storageGB(b[0])));
}

/** Builds the storage regex for a product from its catalog entry. */
export function variantPattern(src, productName) {
  const prefix = src.match ?? productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${prefix} (\\d+ ?[GT]B)\\b`, "i");
}

/** Lowest candidate inside the band around the expected price, or null. */
export function pickBase(candidates, expected) {
  const inBand = candidates.filter((p) => p >= expected * BAND.low && p <= expected * BAND.high);
  return inBand.length ? Math.min(...inBand) : null;
}

/**
 * Parses a number written in any common locale:
 * "1,099" "1.199" "1,09,999" "9,166.58" "1.299,00" → 1099 1199 109999 9166.58 1299
 */
export function parseLocalNumber(s) {
  const t = s.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (last === -1) return Number(t);
  const tail = t.slice(last + 1);
  if (tail.length <= 2) return Number(t.slice(0, last).replace(/[.,]/g, "") + "." + tail);
  return Number(t.replace(/[.,]/g, ""));
}

// Currency amounts written as text, e.g. "$1,099", "£1,079", "Ab 1.199 €", "￥174,800", "₹1,09,999".
const MONEY =
  /(?:US\$|C\$|CA\$|S\$|SGD|A\$|AU\$|HK\$|AED|\$|£|€|¥|￥|₹|Rs\.?)\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?(?:€|円|AED)/g;

export function textPrices(html) {
  return [...html.matchAll(MONEY)].map((m) => parseLocalNumber(m[1] ?? m[2])).filter((n) => n > 0);
}

/** Prices from schema.org JSON-LD blocks (price, lowPrice, highPrice). */
export function jsonLdPrices(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const p of m[1].matchAll(/"(?:price|lowPrice|highPrice)"\s*:\s*"?([\d.,]+)"?/g)) {
      const n = parseLocalNumber(p[1]);
      if (n > 0) out.push(n);
    }
  }
  return out;
}
