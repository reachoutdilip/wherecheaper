// Money formatting and currency helpers. Uses the platform's Intl data so any
// of the ~160 currencies from the exchange-rate feed formats correctly.

const NO_DECIMALS = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "ISK", "HUF", "TWD", "PKR", "INR", "UGX", "COP"]);

function formatter(currency: string, digits: number) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch {
    return null;
  }
}

/** Converted amounts: whole units from 100 up, since cents only add noise when comparing. */
export function formatMoney(amount: number, currency: string) {
  const digits = NO_DECIMALS.has(currency) || Math.abs(amount) >= 100 ? 0 : 2;
  return formatter(currency, digits)?.format(amount) ?? `${currency} ${amount.toFixed(digits)}`;
}

/** A store's sticker price exactly as listed, keeping cents such as $1,349.99. */
export function formatSticker(amount: number, currency: string) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return formatter(currency, digits)?.format(amount) ?? `${currency} ${amount}`;
}

let names: Intl.DisplayNames | null = null;
export function currencyName(code: string) {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

// Browser region → currency, for guessing a first-time visitor's currency.
// The 12 store countries are covered by data/countries.json.
const REGION_CURRENCY: Record<string, string> = {
  AT: "EUR", BE: "EUR", CY: "EUR", EE: "EUR", ES: "EUR", FI: "EUR", FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR",
  IT: "EUR", LT: "EUR", LU: "EUR", LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", TR: "TRY", IL: "ILS",
  NZ: "NZD", MY: "MYR", ID: "IDR", PH: "PHP", TH: "THB", VN: "VND", TW: "TWD", PK: "PKR", BD: "BDT", LK: "LKR",
  NP: "NPR", SA: "SAR", QA: "QAR", KW: "KWD", OM: "OMR", BH: "BHD", EG: "EGP", ZA: "ZAR", NG: "NGN", KE: "KES",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
};

export function regionCurrency(region: string) {
  return REGION_CURRENCY[region.toUpperCase()];
}

/** Currencies offered in the picker besides the store ones: widely used, with stable names everywhere. */
export const EXTRA_CURRENCIES = [...new Set(Object.values(REGION_CURRENCY))].sort();
