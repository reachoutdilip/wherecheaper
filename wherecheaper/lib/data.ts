import countriesJson from "@/data/countries.json";
import catalogJson from "@/data/catalog.json";
import pricesJson from "@/data/prices.json";

export type CountryCode = keyof typeof countriesJson;

export type Country = {
  name: string;
  currency: string;
  symbol: string;
  salesTax: number;
  touristRefund: number;
};

export type PriceStatus = "ok" | "stale" | "manual";

export type PricePoint = {
  /** Price of the cheapest configuration this store sells */
  amount: number;
  /** Price per storage size, e.g. { "256GB": 1199, "512GB": 1399 }, when the store lists them */
  variants?: Record<string, number>;
  checkedAt: string;
  status: PriceStatus;
  url?: string;
};

export type Product = {
  id: string;
  category: string;
  brand: string;
  name: string;
  spec: string;
  /** true when the price is read from the brand's store on every update */
  live: boolean;
  /** Storage sizes sold in at least one country, smallest first */
  storages: string[];
  /** The storage size most countries sell as their entry model; compared by default */
  baseStorage: string | null;
  notes: Partial<Record<CountryCode, string[]>>;
  prices: Partial<Record<CountryCode, PricePoint>>;
};

export const CATEGORIES = ["Phones", "Laptops", "Tablets", "Headphones"] as const;

export const countries = countriesJson as Record<CountryCode, Country>;
export const COUNTRY_CODES = Object.keys(countries) as CountryCode[];

type StoredPrices = { generatedAt: string; products: Record<string, Record<string, PricePoint>> };
const stored = pricesJson as StoredPrices;

export const pricesGeneratedAt = stored.generatedAt;

export const storageGB = (s: string) => parseInt(s, 10) * (s.endsWith("TB") ? 1024 : 1);

function storageInfo(prices: Partial<Record<CountryCode, PricePoint>>) {
  const all = new Set<string>();
  const entry = new Map<string, number>();
  for (const p of Object.values(prices)) {
    if (!p?.variants) continue;
    const sizes = Object.keys(p.variants).sort((a, b) => storageGB(a) - storageGB(b));
    sizes.forEach((s) => all.add(s));
    if (sizes[0]) entry.set(sizes[0], (entry.get(sizes[0]) ?? 0) + 1);
  }
  const storages = [...all].sort((a, b) => storageGB(a) - storageGB(b));
  const baseStorage =
    [...entry].sort((a, b) => b[1] - a[1] || storageGB(a[0]) - storageGB(b[0]))[0]?.[0] ?? null;
  return { storages, baseStorage };
}

type CatalogEntry = {
  id: string;
  category: string;
  brand: string;
  name: string;
  spec?: string;
  source: { type: string };
  notes: Record<string, string[]>;
};

export const products: Product[] = (catalogJson.products as unknown as CatalogEntry[]).map((p) => {
  const prices = (stored.products[p.id] ?? {}) as Product["prices"];
  return {
    id: p.id,
    category: p.category,
    brand: p.brand,
    name: p.name,
    spec: p.spec ?? "",
    live: p.source.type !== "manual",
    ...storageInfo(prices),
    notes: p.notes as Product["notes"],
    prices,
  };
});
