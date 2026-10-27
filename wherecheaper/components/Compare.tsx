"use client";

import { useEffect, useState } from "react";
import Board from "@/components/Board";
import Filters, { type Option } from "@/components/Filters";
import ThemeToggle from "@/components/ThemeToggle";
import { CATEGORIES, COUNTRY_CODES, countries, storageGB, type CountryCode, type Product } from "@/lib/data";
import { compare, formatMoney, timeAgo, type Comparison } from "@/lib/compare";
import { EXTRA_CURRENCIES, currencyName, regionCurrency } from "@/lib/currency";
import type { Rates } from "@/lib/rates";

type Props = { products: Product[]; rates: Rates; pricesGeneratedAt: string; renderedAt: number };
type Sort = "saving" | "price" | "name";
type Summary = { p: Product; cmp: Comparison & { best: NonNullable<Comparison["best"]> } };

const OTHER = "other";

// Remembered per browser; the page works fine without storage.
function usePref<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`wic:${key}`);
      if (raw != null) setValue(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(`wic:${key}`, JSON.stringify(value));
    } catch {}
  }, [key, value, loaded]);
  return [value, setValue, loaded] as const;
}

// First visit: guess where the visitor lives from the browser locale, e.g. "en-IN" → India, INR.
function guessLocale(): { home: string; currency: string } {
  for (const lang of navigator.languages ?? [navigator.language]) {
    const region = (lang.split("-")[1] ?? "").toUpperCase();
    if (!region) continue;
    const cc = (region === "GB" ? "UK" : region) as CountryCode;
    if (countries[cc]) return { home: cc, currency: countries[cc].currency };
    const cur = regionCurrency(region);
    if (cur) return { home: OTHER, currency: cur };
  }
  return { home: "US", currency: "USD" };
}

function countBy<T>(items: T[], key: (t: T) => string[]): Option[] {
  const m = new Map<string, number>();
  for (const it of items) for (const k of key(it)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count }));
}

const pretty = (s: string) => s.replace(/(\d)(GB|TB)/, "$1 $2");
const STORE_CURRENCIES = [...new Set(COUNTRY_CODES.map((cc) => countries[cc].currency))];

export default function Compare({ products, rates, pricesGeneratedAt, renderedAt }: Props) {
  const [category, setCategory] = usePref<string>("cat", "Phones");
  const [brands, setBrands] = usePref<string[]>("brands", []);
  const [storage, setStorage] = usePref<string | null>("storage", null);
  const [selectedCountries, setCountries] = usePref<CountryCode[]>("countries", [...COUNTRY_CODES]);
  const [liveOnly, setLiveOnly] = usePref("liveOnly", false);
  const [homePref, setHomePref, homeLoaded] = usePref<string>("homeCountry", "");
  const [currencyPref, setCurrencyPref, currencyLoaded] = usePref<string>("currency", "");
  const [tourist, setTourist] = usePref("tourist", false);
  const [salesTax, setSalesTax] = usePref("salesTax", true);
  const [sort, setSort] = usePref<Sort>("sort", "saving");
  const [productId, setProductId] = usePref<string>("prod", "");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [boardStorage, setBoardStorage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!homeLoaded || !currencyLoaded || (homePref && currencyPref)) return;
    const g = guessLocale();
    if (!homePref) setHomePref(g.home);
    if (!currencyPref) setCurrencyPref(rates.rates[g.currency] ? g.currency : "USD");
  }, [homeLoaded, currencyLoaded, homePref, currencyPref, setHomePref, setCurrencyPref, rates]);

  const homeCC = homePref && homePref !== OTHER ? (homePref as CountryCode) : homePref ? null : "US";
  const currency = currencyPref && rates.rates[currencyPref] ? currencyPref : "USD";

  const chooseHome = (v: string) => {
    setHomePref(v);
    // Most people want their own currency; they can still pick another one.
    if (v !== OTHER) setCurrencyPref(countries[v as CountryCode].currency);
  };

  // A price cap in one currency or category means nothing in another.
  useEffect(() => setMaxPrice(null), [currency, category]);

  // Lock the page behind the filter sheet on phones.
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const pool = products.filter((p) => !liveOnly || p.live);
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, pool.filter((p) => p.category === c).length]));
  const inCategory = pool.filter((p) => p.category === category);
  const brandOptions = countBy(inCategory, (p) => [p.brand]);
  const activeBrands = brands.filter((b) => brandOptions.some((o) => o.value === b));
  const byBrand = inCategory.filter((p) => !activeBrands.length || activeBrands.includes(p.brand));
  const storageOptions = countBy(byBrand, (p) => p.storages).sort((a, b) => storageGB(a.value) - storageGB(b.value));
  const activeStorage = storage && storageOptions.some((o) => o.value === storage) ? storage : null;

  const opts = { currency, homeCC, tourist, salesTax, countries: selectedCountries };

  // Small catalog (a few dozen products × 12 countries), so this runs on every render.
  const summaries = byBrand
    .filter((p) => !activeStorage || p.storages.includes(activeStorage))
    .map((p) => ({ p, cmp: compare(p, rates.rates, { ...opts, storage: activeStorage }) }))
    .filter((s): s is Summary => !!s.cmp.best);

  const priceCeil = Math.max(0, ...summaries.map((s) => s.cmp.best.converted));
  const saving = (s: Summary) =>
    s.cmp.homeRow ? (s.cmp.homeRow.converted - s.cmp.best.converted) / s.cmp.homeRow.converted : -1;

  // Savings need a home price; without one, sort by price.
  const activeSort: Sort = sort === "saving" && !homeCC ? "price" : sort;
  const shown = summaries
    .filter((s) => maxPrice === null || s.cmp.best.converted <= maxPrice)
    .sort((a, b) =>
      activeSort === "name"
        ? a.p.name.localeCompare(b.p.name)
        : activeSort === "price"
          ? a.cmp.best.converted - b.cmp.best.converted
          : saving(b) - saving(a),
    );

  const selected = shown.find((s) => s.p.id === productId) ?? shown[0];
  // The board follows the storage filter until the viewer picks a size on it.
  useEffect(() => setBoardStorage(null), [activeStorage, selected?.p.id]);
  const boardCmp =
    selected && boardStorage && selected.p.storages.includes(boardStorage)
      ? compare(selected.p, rates.rates, { ...opts, storage: boardStorage })
      : selected?.cmp;

  const excluded = COUNTRY_CODES.length - new Set([...selectedCountries, ...(homeCC ? [homeCC] : [])]).size;
  const chips: { label: string; clear: () => void }[] = [
    ...activeBrands.map((b) => ({ label: b, clear: () => setBrands(brands.filter((x) => x !== b)) })),
    ...(activeStorage ? [{ label: pretty(activeStorage), clear: () => setStorage(null) }] : []),
    ...(maxPrice !== null ? [{ label: `Up to ${formatMoney(maxPrice, currency)}`, clear: () => setMaxPrice(null) }] : []),
    ...(excluded > 0
      ? [{ label: `${COUNTRY_CODES.length - excluded} of ${COUNTRY_CODES.length} countries`, clear: () => setCountries([...COUNTRY_CODES]) }]
      : []),
    ...(liveOnly ? [{ label: "Live prices only", clear: () => setLiveOnly(false) }] : []),
  ];
  const clearAll = () => {
    setBrands([]);
    setStorage(null);
    setMaxPrice(null);
    setCountries([...COUNTRY_CODES]);
    setLiveOnly(false);
  };

  const pick = (id: string) => {
    setProductId(id);
    requestAnimationFrame(() => document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const otherCurrencies = EXTRA_CURRENCIES.filter((c) => !STORE_CURRENCIES.includes(c) && rates.rates[c]);

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--accent)" />
            <rect x="14" y="16" width="36" height="7" rx="3" fill="var(--logo-bar)" />
            <rect x="14" y="28.5" width="28" height="7" rx="3" fill="var(--logo-bar)" />
            <rect x="14" y="41" width="18" height="7" rx="3" fill="var(--logo-best)" />
          </svg>
          <div>
            <h1>
              Where&rsquo;s it <span>cheaper</span>?
            </h1>
            <p>Official store prices in {COUNTRY_CODES.length} countries, at today&rsquo;s exchange rates.</p>
          </div>
        </div>
        <div className="masthead-controls">
          <div className="locale" role="group" aria-label="Your location and currency">
            <label htmlFor="home-country">
              <span>I live in</span>
              <select id="home-country" value={homePref || "US"} onChange={(e) => chooseHome(e.target.value)}>
                {COUNTRY_CODES.map((cc) => (
                  <option key={cc} value={cc}>
                    {countries[cc].name}
                  </option>
                ))}
                <option value={OTHER}>Somewhere else</option>
              </select>
            </label>
            <label htmlFor="currency">
              <span>Show prices in</span>
              <select id="currency" value={currency} onChange={(e) => setCurrencyPref(e.target.value)}>
                <optgroup label="Store currencies">
                  {STORE_CURRENCIES.map((c) => (
                    <option key={c} value={c} suppressHydrationWarning>
                      {c} · {currencyName(c)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other currencies">
                  {otherCurrencies.map((c) => (
                    <option key={c} value={c} suppressHydrationWarning>
                      {c} · {currencyName(c)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="layout">
        <aside className={`sidebar${sheetOpen ? " open" : ""}`} aria-label="Filters">
          <div className="sheet-head">
            <h2>Filters</h2>
            <button type="button" className="icon-btn" onClick={() => setSheetOpen(false)} aria-label="Close filters">
              ×
            </button>
          </div>
          <Filters
            category={category}
            categoryCounts={categoryCounts}
            onCategory={(c) => {
              setCategory(c);
              setStorage(null);
            }}
            brandOptions={brandOptions}
            brands={activeBrands}
            onBrands={setBrands}
            storageOptions={storageOptions}
            storage={activeStorage}
            onStorage={setStorage}
            priceCeil={priceCeil}
            maxPrice={maxPrice}
            onMaxPrice={setMaxPrice}
            selectedCountries={selectedCountries}
            homeCC={homeCC}
            onCountries={setCountries}
            liveOnly={liveOnly}
            onLiveOnly={setLiveOnly}
            currency={currency}
            tourist={tourist}
            onTourist={setTourist}
            salesTax={salesTax}
            onSalesTax={setSalesTax}
          />
          <div className="sheet-foot">
            {chips.length > 0 && (
              <button type="button" className="secondary" onClick={clearAll}>
                Clear all
              </button>
            )}
            <button type="button" className="primary" onClick={() => setSheetOpen(false)}>
              Show {shown.length} {shown.length === 1 ? "product" : "products"}
            </button>
          </div>
        </aside>
        {sheetOpen && <div className="scrim" onClick={() => setSheetOpen(false)} />}

        <main className="main">
          <div className="results-bar">
            <button type="button" className="filters-btn" onClick={() => setSheetOpen(true)}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              Filters
              {chips.length > 0 && <span className="badge-count">{chips.length}</span>}
            </button>
            <h2 className="result-count">
              {shown.length} {category.toLowerCase()}
              {activeStorage && <span> · {pretty(activeStorage)}</span>}
            </h2>
            <label className="sort" htmlFor="sort">
              <span>Sort by</span>
              <select id="sort" value={activeSort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="saving" disabled={!homeCC}>
                  Biggest saving
                </option>
                <option value="price">Lowest price</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <div className="chips">
              {chips.map((c) => (
                <button key={c.label} type="button" className="chip-x" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                  {c.label}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              <button type="button" className="link" onClick={clearAll}>
                Clear all
              </button>
            </div>
          )}

          {shown.length === 0 ? (
            <div className="empty">
              <b>No products match these filters</b>
              <p>Try another storage size, a higher price, or more countries.</p>
              <button type="button" className="secondary" onClick={clearAll}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid">
              {shown.map(({ p, cmp }) => (
                <Card
                  key={p.id}
                  p={p}
                  cmp={cmp}
                  currency={currency}
                  homeCC={homeCC}
                  selected={p.id === selected?.p.id}
                  onPick={() => pick(p.id)}
                />
              ))}
            </div>
          )}

          {selected && boardCmp && (
            <Board
              product={selected.p}
              cmp={boardCmp}
              currency={currency}
              homeCC={homeCC}
              renderedAt={renderedAt}
              pricesGeneratedAt={pricesGeneratedAt}
              storage={boardCmp.storage}
              onStorage={setBoardStorage}
            />
          )}

          <details className="about">
            <summary>How prices are compared</summary>
            <dl>
              <dt>Where prices come from</dt>
              <dd>
                Apple, Samsung and Google prices are read daily from each brand&rsquo;s official store in every country (last
                run {timeAgo(pricesGeneratedAt, renderedAt)}). Products marked &ldquo;Launch price&rdquo; show the official
                price at launch. Exchange rates from {rates.source}, updated {timeAgo(rates.updatedAt, renderedAt)}.
              </dd>
              <dt>What&rsquo;s compared</dt>
              <dd>
                The same storage size in every country, at the official store&rsquo;s price for an unlocked device. Carrier
                deals, sales and retailer discounts can be lower.
              </dd>
              <dt>Taxes</dt>
              <dd>
                Prices outside the US and Canada include VAT/GST. US and Canadian list prices don&rsquo;t, so the sales-tax
                option adds a typical 7.5% (US) or 13% (Canada). Hong Kong has no sales tax.
              </dd>
              <dt>Tourist refunds</dt>
              <dd>
                Estimates after typical operator fees, never applied to the country you live in. They need a minimum spend,
                your passport, and export within a time limit. The UK, US, Canada, India and Hong Kong offer none.
              </dd>
              <dt>Before buying abroad</dt>
              <dd>Check warranty coverage, keyboard layout, network bands, and your home country&rsquo;s customs allowance.</dd>
            </dl>
          </details>
        </main>
      </div>
    </div>
  );
}

function Card({
  p,
  cmp,
  currency,
  homeCC,
  selected,
  onPick,
}: {
  p: Product;
  cmp: Summary["cmp"];
  currency: string;
  homeCC: CountryCode | null;
  selected: boolean;
  onPick: () => void;
}) {
  const { best, homeRow } = cmp;
  const save = homeRow ? homeRow.converted - best.converted : 0;
  const pct = homeRow ? (save / homeRow.converted) * 100 : 0;
  const bestIsHome = best.cc === homeCC;

  let badge: { text: string; tone: string } | null = null;
  if (homeRow) {
    if (bestIsHome) badge = { text: "Best at home", tone: "home" };
    else if (pct < 1) badge = { text: "Same as home", tone: "neutral" };
    else badge = { text: `Save ${Math.round(pct)}%`, tone: "good" };
  }
  const homeName = homeCC ? countries[homeCC].name : null;
  const missingAtHome =
    !homeRow && homeCC
      ? p.prices[homeCC] && cmp.storage
        ? `${pretty(cmp.storage)} not sold`
        : "Not sold"
      : null;

  const spec = [cmp.storage && pretty(cmp.storage), p.spec].filter(Boolean).join(" · ");

  return (
    <button type="button" className="card" aria-pressed={selected} onClick={onPick}>
      <span className="card-top">
        <span className="label">{p.brand}</span>
        {badge && <span className={`badge ${badge.tone}`}>{badge.text}</span>}
      </span>
      <b className="card-name">{p.name}</b>
      {spec && <span className="card-spec">{spec}</span>}
      <span className="card-price mono">{formatMoney(best.converted, currency)}</span>
      <span className="card-where">
        <span className="cc">{best.cc}</span>
        {bestIsHome ? `${countries[best.cc].name} · your country` : `Cheapest in ${countries[best.cc].name}`}
      </span>
      {homeName && (
        <span className="card-compare">
          {homeRow && !bestIsHome ? (
            <>
              <span className="cmp-line">
                <span>{homeName} price</span>
                <s className="mono">{formatMoney(homeRow.converted, currency)}</s>
              </span>
              <span className={`cmp-line${pct >= 1 ? " good" : ""}`}>
                <span>{save >= 0 ? "You save" : "You pay more"}</span>
                <b className="mono">{formatMoney(Math.abs(save), currency)}</b>
              </span>
            </>
          ) : homeRow ? (
            <span className="cmp-line">
              <span>Cheapest where you live</span>
            </span>
          ) : (
            <span className="cmp-line muted-line">
              <span>{homeName} price</span>
              <span>{missingAtHome}</span>
            </span>
          )}
        </span>
      )}
      {!p.live && <span className="src">Launch price</span>}
    </button>
  );
}
