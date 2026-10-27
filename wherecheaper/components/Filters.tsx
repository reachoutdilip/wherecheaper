"use client";

import { CATEGORIES, COUNTRY_CODES, countries, type CountryCode } from "@/lib/data";
import { formatMoney } from "@/lib/compare";

export type Option = { value: string; count: number };

type Props = {
  category: string;
  categoryCounts: Record<string, number>;
  onCategory: (c: string) => void;

  brandOptions: Option[];
  brands: string[];
  onBrands: (b: string[]) => void;

  storageOptions: Option[];
  storage: string | null;
  onStorage: (s: string | null) => void;

  priceCeil: number;
  maxPrice: number | null;
  onMaxPrice: (n: number | null) => void;

  selectedCountries: CountryCode[];
  homeCC: CountryCode | null;
  onCountries: (c: CountryCode[]) => void;

  liveOnly: boolean;
  onLiveOnly: (v: boolean) => void;

  /** Currency the slider is shown in */
  currency: string;
  tourist: boolean;
  onTourist: (v: boolean) => void;
  salesTax: boolean;
  onSalesTax: (v: boolean) => void;
};

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// Rounds the slider's top end to a tidy number in any currency.
function niceCeil(n: number) {
  if (n <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / (p / 2)) * (p / 2);
}

export default function Filters(p: Props) {
  const ceil = niceCeil(p.priceCeil);
  const step = Math.max(1, ceil / 100);

  return (
    <div className="filters">
      <section className="fgroup">
        <h3 className="label">Category</h3>
        <div className="radio-list">
          {CATEGORIES.map((c) => (
            <label key={c} className={`opt${c === p.category ? " on" : ""}`}>
              <input type="radio" name="category" value={c} checked={c === p.category} onChange={() => p.onCategory(c)} />
              <span>{c}</span>
              <span className="count">{p.categoryCounts[c] ?? 0}</span>
            </label>
          ))}
        </div>
      </section>

      {p.brandOptions.length > 1 && (
        <section className="fgroup">
          <h3 className="label">Brand</h3>
          <div className="check-list">
            {p.brandOptions.map((b) => (
              <label key={b.value} className="opt">
                <input type="checkbox" checked={p.brands.includes(b.value)} onChange={() => p.onBrands(toggle(p.brands, b.value))} />
                <span>{b.value}</span>
                <span className="count">{b.count}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {p.storageOptions.length > 0 && (
        <section className="fgroup">
          <h3 className="label">Storage</h3>
          <div className="pill-grid">
            <button type="button" className="pill" aria-pressed={p.storage === null} onClick={() => p.onStorage(null)}>
              Base model
            </button>
            {p.storageOptions.map((s) => (
              <button
                key={s.value}
                type="button"
                className="pill"
                aria-pressed={p.storage === s.value}
                onClick={() => p.onStorage(p.storage === s.value ? null : s.value)}
              >
                {s.value.replace(/(\d)(GB|TB)/, "$1 $2")}
                <span className="count">{s.count}</span>
              </button>
            ))}
          </div>
          <p className="hint">Compares the same storage size in every country.</p>
        </section>
      )}

      {ceil > 0 && (
        <section className="fgroup">
          <div className="fgroup-head">
            <h3 className="label">Best price up to</h3>
            {p.maxPrice !== null && (
              <button type="button" className="link" onClick={() => p.onMaxPrice(null)}>
                Reset
              </button>
            )}
          </div>
          <output className="price-out mono" htmlFor="max-price">
            {p.maxPrice === null ? "Any price" : formatMoney(p.maxPrice, p.currency)}
          </output>
          <input
            id="max-price"
            type="range"
            min={0}
            max={ceil}
            step={step}
            value={p.maxPrice ?? ceil}
            onChange={(e) => {
              const v = Number(e.target.value);
              p.onMaxPrice(v >= ceil ? null : v);
            }}
          />
          <div className="range-ends mono">
            <span>{formatMoney(0, p.currency).replace(/\.00$/, "")}</span>
            <span>{formatMoney(ceil, p.currency)}</span>
          </div>
        </section>
      )}

      <section className="fgroup">
        <div className="fgroup-head">
          <h3 className="label">Countries to compare</h3>
          <button
            type="button"
            className="link"
            onClick={() => p.onCountries(p.selectedCountries.length === COUNTRY_CODES.length ? [] : [...COUNTRY_CODES])}
          >
            {p.selectedCountries.length === COUNTRY_CODES.length ? "Clear" : "Select all"}
          </button>
        </div>
        <div className="check-list countries">
          {COUNTRY_CODES.map((cc) => {
            const isHome = cc === p.homeCC;
            return (
              <label key={cc} className="opt">
                <input
                  type="checkbox"
                  checked={isHome || p.selectedCountries.includes(cc)}
                  disabled={isHome}
                  onChange={() => p.onCountries(toggle(p.selectedCountries, cc))}
                />
                <span className="cc">{cc}</span>
                <span>{countries[cc].name}</span>
                {isHome && <span className="count">you</span>}
              </label>
            );
          })}
        </div>
        <p className="hint">Leave out places you can&rsquo;t travel to.</p>
      </section>

      <section className="fgroup">
        <h3 className="label">Price options</h3>
        <label className="switch" htmlFor="tourist">
          <input id="tourist" type="checkbox" className="toggle" checked={p.tourist} onChange={(e) => p.onTourist(e.target.checked)} />
          <span>
            I&rsquo;m a tourist
            <small>Subtract the VAT/GST refund visitors can claim</small>
          </span>
        </label>
        <label className="switch" htmlFor="salestax">
          <input id="salestax" type="checkbox" className="toggle" checked={p.salesTax} onChange={(e) => p.onSalesTax(e.target.checked)} />
          <span>
            Add US/Canada sales tax
            <small>Their list prices exclude it</small>
          </span>
        </label>
        <label className="switch" htmlFor="liveonly">
          <input id="liveonly" type="checkbox" className="toggle" checked={p.liveOnly} onChange={(e) => p.onLiveOnly(e.target.checked)} />
          <span>
            Live store prices only
            <small>Hide products with launch prices</small>
          </span>
        </label>
      </section>
    </div>
  );
}
