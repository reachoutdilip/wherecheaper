import { countries, type CountryCode, type PricePoint, type Product } from "@/lib/data";
import { formatMoney, formatSticker } from "@/lib/currency";

export { formatMoney };

export type Options = {
  /** Currency to show converted prices in */
  currency: string;
  /** Where the visitor lives: the price they'd otherwise pay. null = not one of our countries */
  homeCC: CountryCode | null;
  tourist: boolean;
  salesTax: boolean;
  /** Storage size to compare; null compares each product's base storage */
  storage: string | null;
  /** Countries to include; the home country is always included */
  countries: CountryCode[];
};

export type Row = {
  cc: CountryCode;
  price: PricePoint;
  /** Local sticker price for the compared configuration */
  local: number;
  converted: number;
  rate: number; // 1 unit of local currency in home currency
  adjustments: string[];
};

export type Comparison = {
  storage: string | null;
  rows: Row[];
  /** Countries with no official price for this configuration, and why */
  missing: { cc: CountryCode; reason: string }[];
  best: Row | null;
  homeRow: Row | null;
};

const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;

/** Local price for one configuration, or null when that store doesn't sell it. */
function localPrice(p: PricePoint, storage: string | null, product: Product) {
  if (!storage) return p.amount;
  if (p.variants) return p.variants[storage] ?? null;
  // A store without a storage list sells one configuration: assume it's the base one.
  return storage === product.baseStorage ? p.amount : null;
}

export function compare(product: Product, rates: Record<string, number>, opts: Options): Comparison {
  const storage = opts.storage ?? product.baseStorage;
  const { homeCC } = opts;
  const include = new Set<CountryCode>(opts.countries);
  if (homeCC) include.add(homeCC);

  const rows: Row[] = [];
  const missing: Comparison["missing"] = [];

  for (const cc of Object.keys(countries) as CountryCode[]) {
    if (!include.has(cc)) continue;
    const c = countries[cc];
    const price = product.prices[cc];
    if (!price) {
      missing.push({ cc, reason: "No official store price" });
      continue;
    }
    const local = localPrice(price, storage, product);
    if (local == null) {
      missing.push({ cc, reason: `${storage} not sold here` });
      continue;
    }
    let v = local;
    const adjustments: string[] = [];
    if (opts.salesTax && c.salesTax) {
      v *= 1 + c.salesTax;
      adjustments.push(`+${pct(c.salesTax)} sales tax`);
    }
    // Residents can't claim a tourist refund in their own country.
    if (opts.tourist && c.touristRefund && cc !== homeCC) {
      v *= 1 - c.touristRefund;
      adjustments.push(`−${pct(c.touristRefund)} tourist refund`);
    }
    const rate = rates[opts.currency] / rates[c.currency];
    rows.push({ cc, price, local, converted: v * rate, rate, adjustments });
  }

  rows.sort((a, b) => a.converted - b.converted);
  return {
    storage,
    rows,
    missing,
    best: rows[0] ?? null,
    homeRow: rows.find((r) => r.cc === homeCC) ?? null,
  };
}

export function formatLocal(amount: number, cc: CountryCode) {
  return formatSticker(amount, countries[cc].currency);
}

export function formatRate(x: number) {
  if (x >= 100) return x.toFixed(1);
  if (x >= 1) return x.toFixed(3);
  if (x >= 0.01) return x.toFixed(4);
  return x.toPrecision(3);
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d < 60) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
