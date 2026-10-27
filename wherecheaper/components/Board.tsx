"use client";

import { useState } from "react";
import { countries, type CountryCode, type Product } from "@/lib/data";
import { formatLocal, formatMoney, formatRate, timeAgo, type Comparison } from "@/lib/compare";

type Props = {
  product: Product;
  cmp: Comparison;
  currency: string;
  homeCC: CountryCode | null;
  renderedAt: number;
  pricesGeneratedAt: string;
  storage: string | null;
  onStorage: (s: string) => void;
};

const pretty = (s: string) => s.replace(/(\d)(GB|TB)/, "$1 $2");
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });

export default function Board({ product, cmp, currency, homeCC, renderedAt, pricesGeneratedAt, storage, onStorage }: Props) {
  const { rows, missing, best, homeRow } = cmp;
  const worst = rows[rows.length - 1];
  const homeName = homeCC ? countries[homeCC].name : null;
  const pctOver = (v: number) => (best ? (v / best.converted - 1) * 100 : 0);
  const [mode, setMode] = useState<"home" | "cheapest">("home");
  const vsHome = mode === "home" && !!homeRow;
  const homeVariants = homeCC ? product.prices[homeCC]?.variants : undefined;
  const homeSizes = homeVariants ? Object.keys(homeVariants).filter((s) => s !== storage) : [];
  const homeMark = homeRow ? (homeRow.converted / worst.converted) * 100 : null;

  return (
    <section className="board" id="board" aria-labelledby="board-title">
      <div className="board-head">
        <div className="board-title">
          <span className="label">{product.brand}</span>
          <h2 id="board-title">{product.name}</h2>
          <p className="muted">
            {[product.spec, product.live ? `Store prices checked ${timeAgo(pricesGeneratedAt, renderedAt)}` : "Launch prices"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {product.storages.length > 1 && (
          <div className="segmented" role="radiogroup" aria-label="Storage">
            {product.storages.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === storage} onClick={() => onStorage(s)}>
                {pretty(s)}
              </button>
            ))}
          </div>
        )}
      </div>

      {best && (
        <div className="verdict" aria-live="polite">
          <div className="best">
            <span className="label">Cheapest{storage ? ` · ${pretty(storage)}` : ""}</span>
            <span className="big">{countries[best.cc].name}</span>
            <span className="sub mono">
              {formatMoney(best.converted, currency)}
              {countries[best.cc].currency !== currency && <> · {formatLocal(best.local, best.cc)}</>}
            </span>
          </div>
          {homeRow && homeRow.cc !== best.cc ? (
            <div>
              <span className="label">You save vs {homeName}</span>
              <span className="big mono good">{formatMoney(homeRow.converted - best.converted, currency)}</span>
              <span className="sub">
                {(((homeRow.converted - best.converted) / homeRow.converted) * 100).toFixed(1)}% less than{" "}
                {formatMoney(homeRow.converted, currency)}
              </span>
            </div>
          ) : homeRow ? (
            <div>
              <span className="label">Where you live</span>
              <span className="big">Buy at home</span>
              <span className="sub">{homeName} is already the cheapest</span>
            </div>
          ) : (
            <div>
              <span className="label">Where you live</span>
              <span className="big">{homeName ? "Not sold" : "—"}</span>
              <span className="sub">
                {homeName
                  ? `No official ${storage ? pretty(storage) + " " : ""}price in ${homeName}`
                  : "Pick your country at the top to see your saving"}
              </span>
              {homeSizes.length > 0 && (
                <span className="sub suggest">
                  {homeName} sells{" "}
                  {homeSizes.map((s) => (
                    <button key={s} type="button" className="mini" onClick={() => onStorage(s)}>
                      {pretty(s)}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}
          <div>
            <span className="label">Cheapest vs priciest</span>
            <span className="big mono">{formatMoney(worst.converted - best.converted, currency)}</span>
            <span className="sub">
              {rows.length > 1
                ? `${countries[worst.cc].name} is ${pctOver(worst.converted).toFixed(0)}% higher`
                : "Only one country to compare"}
            </span>
          </div>
        </div>
      )}

      <div className="table-tools">
        {homeRow ? (
          <div className="segmented small" role="radiogroup" aria-label="Compare each country with">
            <button type="button" role="radio" aria-checked={vsHome} onClick={() => setMode("home")}>
              vs {homeName} price
            </button>
            <button type="button" role="radio" aria-checked={!vsHome} onClick={() => setMode("cheapest")}>
              vs cheapest
            </button>
          </div>
        ) : (
          <span className="muted">Compared with the cheapest country</span>
        )}
        {homeRow && (
          <span className="legend">
            <span className="legend-mark" aria-hidden="true" /> {homeName}: {formatMoney(homeRow.converted, currency)}
          </span>
        )}
      </div>
      <div className="table-head" aria-hidden="true">
        <span />
        <span>Country</span>
        <span>Store price</span>
        <span>In {currency}</span>
        <span>{vsHome ? "vs home" : "vs cheapest"}</span>
      </div>
      <ol className="rows">
        {rows.map((r, i) => {
          const c = countries[r.cc];
          const isHome = r.cc === homeCC;
          const notes = [...(product.notes[r.cc] ?? []), ...r.adjustments];
          const status =
            r.price.status === "manual"
              ? { text: `Launch price, ${monthYear(r.price.checkedAt)}`, tone: "" }
              : r.price.status === "stale"
                ? { text: `Price from ${timeAgo(r.price.checkedAt, renderedAt)}`, tone: "stale" }
                : null;
          return (
            <li key={r.cc} className={`row${i === 0 ? " best" : ""}${isHome ? " home" : ""}`}>
              <span className="rank">{i + 1}</span>
              <div className="ctry">
                <span className="cc">{r.cc}</span>
                <span className="nm">
                  {c.name}
                  {isHome && <span className="home-tag">You</span>}
                </span>
              </div>
              <div className="local">
                {r.price.url ? (
                  <a href={r.price.url} target="_blank" rel="noopener noreferrer" title={`Open ${c.name} store page`}>
                    {formatLocal(r.local, r.cc)}
                    <span className="ext" aria-hidden="true">↗</span>
                  </a>
                ) : (
                  formatLocal(r.local, r.cc)
                )}
                {c.currency !== currency && <small>1 {c.currency} = {formatRate(r.rate)} {currency}</small>}
              </div>
              <div className="barcell">
                <div className="barline">
                  <div className="bartrack">
                    <div
                      className={`barfill${homeRow && r.converted < homeRow.converted - 0.5 ? " under" : ""}`}
                      style={{ width: `${((r.converted / worst.converted) * 100).toFixed(1)}%` }}
                    />
                    {homeMark !== null && <span className="home-mark" style={{ left: `${homeMark.toFixed(1)}%` }} />}
                  </div>
                  <span className="conv">{formatMoney(r.converted, currency)}</span>
                </div>
                {(status || notes.length > 0) && (
                  <div className="notes">
                    {status && <span className={`note ${status.tone}`}>{status.text}</span>}
                    {notes.map((n) => (
                      <span key={n} className="note">
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Delta
                vsHome={vsHome}
                isHome={isHome}
                isBest={i === 0}
                diff={homeRow ? r.converted - homeRow.converted : 0}
                pct={homeRow ? (r.converted / homeRow.converted - 1) * 100 : pctOver(r.converted)}
                overBest={pctOver(r.converted)}
                currency={currency}
              />
            </li>
          );
        })}
        {missing.map(({ cc, reason }) => (
          <li key={cc} className="row na">
            <span className="rank">–</span>
            <div className="ctry">
              <span className="cc">{cc}</span>
              <span className="nm">{countries[cc].name}</span>
            </div>
            <div className="local reason">{reason}</div>
            <div className="barcell" />
            <span />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Delta(p: {
  vsHome: boolean;
  isHome: boolean;
  isBest: boolean;
  diff: number;
  pct: number;
  overBest: number;
  currency: string;
}) {
  if (!p.vsHome) {
    return (
      <span className={`delta ${p.isBest ? "best" : "more"}`}>
        {p.isBest ? "Cheapest" : `+${p.overBest.toFixed(1)}%`}
      </span>
    );
  }
  if (p.isHome) return <span className="delta home">Your price</span>;
  if (Math.abs(p.pct) < 0.5) return <span className="delta same">Same</span>;
  const cheaper = p.diff < 0;
  return (
    <span className={`delta ${cheaper ? "best" : "more"} two`}>
      <b>
        {cheaper ? "−" : "+"}
        {formatMoney(Math.abs(p.diff), p.currency)}
      </b>
      <small>
        {cheaper ? "−" : "+"}
        {Math.abs(p.pct).toFixed(1)}%
      </small>
    </span>
  );
}
