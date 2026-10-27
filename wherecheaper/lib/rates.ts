import { countries } from "@/lib/data";

// Units of each currency per 1 USD.
export type Rates = {
  rates: Record<string, number>;
  updatedAt: string;
  source: string;
};

// Used only if both live sources are down, so the page still renders.
const FALLBACK: Rates = {
  rates: { USD: 1, EUR: 0.8784, GBP: 0.7556, INR: 95.93, JPY: 157.49, AED: 3.6725, SGD: 1.2782, CAD: 1.4149, AUD: 1.4258, HKD: 7.8445, CNY: 6.7195, KRW: 1356.04 },
  updatedAt: "2026-09-28T00:00:00Z",
  source: "Built-in reference rates (live rates unavailable)",
};

const REVALIDATE_SECONDS = 6 * 60 * 60;
const needed = [...new Set(Object.values(countries).map((c) => c.currency))];

function complete(rates: Record<string, number>) {
  return needed.every((cur) => typeof rates[cur] === "number" && rates[cur] > 0);
}

async function fromOpenErApi(): Promise<Rates> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: REVALIDATE_SECONDS } });
  const body = await res.json();
  if (body.result !== "success" || !complete(body.rates)) throw new Error("open.er-api: bad response");
  // Keep every currency (about 160) so visitors can see prices in their own money.
  return {
    rates: body.rates,
    updatedAt: new Date(body.time_last_update_unix * 1000).toISOString(),
    source: "ExchangeRate-API (open.er-api.com)",
  };
}

// Frankfurter publishes ECB reference rates. The ECB doesn't quote AED, which
// is pegged to the dollar at 3.6725, so we add it.
async function fromFrankfurter(): Promise<Rates> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD", { next: { revalidate: REVALIDATE_SECONDS } });
  const body = await res.json();
  const rates = { USD: 1, AED: 3.6725, ...body.rates };
  if (!complete(rates)) throw new Error("frankfurter: missing currencies");
  return {
    rates,
    updatedAt: new Date(`${body.date}T16:00:00Z`).toISOString(),
    source: "European Central Bank via Frankfurter",
  };
}

export async function getRates(): Promise<Rates> {
  for (const source of [fromOpenErApi, fromFrankfurter]) {
    try {
      return await source();
    } catch (err) {
      console.warn("Exchange rate source failed:", err);
    }
  }
  return FALLBACK;
}
