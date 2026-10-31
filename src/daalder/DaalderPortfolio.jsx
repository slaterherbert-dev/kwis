import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const signed = (n, digits = 2) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
const tone = (n) => (n > 0.004 ? "dl-up" : n < -0.004 ? "dl-down" : "");
const shortDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Colors come from CSS variables (--dl-c-checking, ...) so dark mode works.
const SLICES = [
  { key: "checking", label: "Checking", es: "Cheques" },
  { key: "savings", label: "Savings", es: "Ahorros" },
  { key: "cd", label: "CDs", es: "CDs" },
  { key: "bond", label: "Bonds", es: "Bonos" },
  { key: "stocks", label: "Stocks", es: "Acciones" },
  { key: "desks", label: "Desks", es: "Escritorios" },
];

// ---------- Donut: where my Munt is ----------
function Donut({ slices, total, currency }) {
  const R = 70;
  const W = 26;
  const C = 2 * Math.PI * R;
  const gap = slices.length > 1 ? 1.5 : 0;
  let offset = 0;
  return (
    <svg
      viewBox="0 0 200 200"
      className="dl-donut"
      role="img"
      aria-label={`Net worth ${fmt(total)} ${currency}: ${slices
        .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
        .join(", ")}`}
    >
      <circle cx="100" cy="100" r={R} fill="none" strokeWidth={W} className="dl-donut-track" />
      {slices.map((s) => {
        const len = (s.value / total) * C;
        const el = (
          <circle
            key={s.key}
            cx="100"
            cy="100"
            r={R}
            fill="none"
            strokeWidth={W}
            style={{ stroke: `var(--dl-c-${s.key})` }}
            strokeDasharray={`${Math.max(len - gap, 0)} ${C}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 100 100)"
          />
        );
        offset += len;
        return el;
      })}
      <text x="100" y="98" textAnchor="middle" className="dl-donut-big">{fmt0(total)}</text>
      <text x="100" y="120" textAnchor="middle" className="dl-donut-small">{currency}</text>
    </svg>
  );
}

// ---------- Line chart: over time ----------
function LineChart({ points, percent, currency }) {
  const W = 340;
  const H = 180;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const values = points.map((p) => p.value);
  let min = Math.min(...values, percent ? 0 : Infinity);
  let max = Math.max(...values, percent ? 0 : -Infinity);
  if (max - min < 1) {
    max += 1;
    min -= 1;
  }
  const n = points.length;
  const x = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => padT + ((max - v) / (max - min)) * (H - padT - padB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const ticks = [max, (max + min) / 2, min];
  const label = (v) => (percent ? `${signed(v, 0)}%` : fmt0(v));
  const last = points[n - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="dl-line"
      role="img"
      aria-label={`${percent ? "Stock gain" : "Net worth"} from ${shortDate(points[0].day)} to ${shortDate(
        last.day
      )}: now ${percent ? `${signed(last.value)}%` : `${fmt(last.value)} ${currency}`}`}
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="dl-line-grid" />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="dl-line-tick">{label(t)}</text>
        </g>
      ))}
      {percent && min < 0 && max > 0 && (
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="dl-line-zero" />
      )}
      <path d={area} className="dl-line-area" />
      <path d={line} className="dl-line-path" />
      <circle cx={x(n - 1)} cy={y(last.value)} r="4" className="dl-line-dot" />
      <text x={padL} y={H - 6} className="dl-line-tick">{shortDate(points[0].day)}</text>
      <text x={W - padR} y={H - 6} textAnchor="end" className="dl-line-tick">{shortDate(last.day)}</text>
    </svg>
  );
}

// A short, plain-language observation about the student's mix.
function insight(slices, total) {
  if (total < 20) return null;
  const share = (key) => (slices.find((s) => s.key === key)?.value ?? 0) / total;
  if (share("stocks") > 0.7)
    return "Most of your Munt is in stocks. Stock prices can drop, so spreading your Munt out (diversifying) lowers your risk. · Diversificar baja el riesgo.";
  if (share("checking") > 0.8)
    return "Most of your Munt is sitting in checking, where it earns nothing. Savings, CDs, and bonds earn interest. · Tu dinero en cheques no gana interés.";
  if (slices.length >= 4)
    return "Your Munt is spread across several places. That's called diversifying. · Eso se llama diversificar.";
  return null;
}

export default function DaalderPortfolio({
  checking,
  savings,
  deposits,
  stocks,
  holdings,
  stockOrders,
  deskValue,
  currency,
  onBack,
}) {
  const [snapshots, setSnapshots] = useState([]);
  const [lineMode, setLineMode] = useState("worth"); // worth | stocks
  const [barMode, setBarMode] = useState("pct"); // pct | munt

  useEffect(() => {
    supabase
      .from("daalder_snapshots")
      .select("day, checking, savings, deposits, stocks, stocks_cost, desks")
      .order("day")
      .then(({ data }) => setSnapshots(data ?? []));
  }, []);

  // ---------- Today, from live data ----------
  const priceOf = (sym) => Number(stocks.find((s) => s.symbol === sym)?.price ?? 0);
  const held = holdings.filter((h) => Number(h.shares) > 0);
  let stockValue = held.reduce((sum, h) => sum + Number(h.shares) * priceOf(h.symbol), 0);
  let stockCost = held.reduce((sum, h) => sum + Number(h.cost), 0);
  for (const o of stockOrders) {
    if (o.side === "buy") {
      stockValue += Number(o.amount);
      stockCost += Number(o.amount);
    } else {
      stockValue += Number(o.shares) * priceOf(o.symbol);
      stockCost += Number(o.cost ?? 0);
    }
  }
  const cdValue = deposits.filter((d) => d.kind === "cd").reduce((s, d) => s + Number(d.principal), 0);
  const bondValue = deposits.filter((d) => d.kind === "bond").reduce((s, d) => s + Number(d.principal), 0);

  const amounts = {
    checking,
    savings,
    cd: cdValue,
    bond: bondValue,
    stocks: stockValue,
    desks: deskValue,
  };
  const slices = SLICES.map((s) => ({ ...s, value: amounts[s.key] })).filter((s) => s.value > 0.004);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  // ---------- Over time: saved days plus today ----------
  const today = todayISO();
  const days = snapshots
    .filter((s) => s.day !== today)
    .map((s) => ({
      day: s.day,
      worth: [s.checking, s.savings, s.deposits, s.stocks, s.desks].reduce((a, b) => a + Number(b), 0),
      stockPct: Number(s.stocks_cost) > 0 ? ((s.stocks - s.stocks_cost) / s.stocks_cost) * 100 : null,
    }));
  days.push({
    day: today,
    worth: total,
    stockPct: stockCost > 0 ? ((stockValue - stockCost) / stockCost) * 100 : null,
  });
  const linePoints =
    lineMode === "worth"
      ? days.map((d) => ({ day: d.day, value: d.worth }))
      : days.filter((d) => d.stockPct != null).map((d) => ({ day: d.day, value: d.stockPct }));
  const change = linePoints.length > 1 ? linePoints[linePoints.length - 1].value - linePoints[0].value : 0;

  // ---------- Gain or loss by stock ----------
  const bars = held
    .map((h) => {
      const value = Number(h.shares) * priceOf(h.symbol);
      const cost = Number(h.cost);
      return {
        symbol: h.symbol,
        gain: value - cost,
        pct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);
  const barValue = (b) => (barMode === "pct" ? b.pct : b.gain);
  const maxAbs = Math.max(...bars.map((b) => Math.abs(barValue(b))), 0.01);
  const note = insight(slices, total);

  return (
    <div>
      <div className="dl-row" style={{ justifyContent: "space-between", margin: "1.25rem 0 1rem" }}>
        <h2 style={{ margin: 0 }}>
          My portfolio <small className="dl-muted" style={{ fontWeight: 400 }}>Mi portafolio</small>
        </h2>
        <button className="dl-btn quiet small" onClick={onBack}>Back · Volver</button>
      </div>

      <section className="dl-panel">
        <h2>Where my Munt is<small>Dónde está mi dinero</small></h2>
        {total <= 0 ? (
          <p className="dl-muted" style={{ margin: 0 }}>Nothing yet. Earn some Munt and come back.</p>
        ) : (
          <>
            <div className="dl-donut-wrap">
              <Donut slices={slices} total={total} currency={currency} />
              <ul className="dl-legend-list">
                {slices.map((s) => (
                  <li key={s.key}>
                    <i style={{ background: `var(--dl-c-${s.key})` }} />
                    <span>
                      {s.label} {s.es !== s.label && <span className="dl-muted">· {s.es}</span>}
                    </span>
                    <span className="num">{Math.round((s.value / total) * 100)}%</span>
                    <span className="num dl-muted">{fmt(s.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {note && <p className="dl-preview">{note}</p>}
          </>
        )}
      </section>

      <section className="dl-panel">
        <div className="dl-row" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Over time<small>Con el tiempo</small></h2>
          <div className="dl-segment small" role="group" aria-label="What to graph">
            <button className="dl-seg" aria-pressed={lineMode === "worth"} onClick={() => setLineMode("worth")}>
              Net worth
            </button>
            <button className="dl-seg" aria-pressed={lineMode === "stocks"} onClick={() => setLineMode("stocks")}>
              Stocks %
            </button>
          </div>
        </div>
        {linePoints.length < 2 ? (
          <p className="dl-muted" style={{ margin: 0 }}>
            {lineMode === "stocks" && linePoints.length === 0
              ? "Buy a stock and your graph starts here. · Compra una acción para empezar."
              : "Your graph starts today. Daalder saves one point every evening, so check back tomorrow. · Vuelve mañana."}
          </p>
        ) : (
          <>
            <p className="dl-muted" style={{ marginTop: 0 }}>
              Since {shortDate(linePoints[0].day)}:{" "}
              <strong className={tone(change)}>
                {lineMode === "worth" ? `${signed(change)} ${currency}` : `${signed(change)} points`}
              </strong>
            </p>
            <LineChart points={linePoints} percent={lineMode === "stocks"} currency={currency} />
          </>
        )}
      </section>

      {bars.length > 0 && (
        <section className="dl-panel">
          <div className="dl-row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>Each stock<small>Cada acción</small></h2>
            <div className="dl-segment small" role="group" aria-label="Show gain as">
              <button className="dl-seg" aria-pressed={barMode === "pct"} onClick={() => setBarMode("pct")}>%</button>
              <button className="dl-seg" aria-pressed={barMode === "munt"} onClick={() => setBarMode("munt")}>
                {currency}
              </button>
            </div>
          </div>
          <p className="dl-muted" style={{ marginTop: 0 }}>Gain or loss since you bought · Ganancia o pérdida</p>
          <div className="dl-bars">
            {bars.map((b) => {
              const v = barValue(b);
              const width = `${(Math.abs(v) / maxAbs) * 50}%`;
              return (
                <div className="dl-bar-row" key={b.symbol}>
                  <span className="dl-bar-label">{b.symbol}</span>
                  <span className="dl-bar-track">
                    <span
                      className={`dl-bar ${v >= 0 ? "up" : "down"}`}
                      style={v >= 0 ? { left: "50%", width } : { right: "50%", width }}
                    />
                  </span>
                  <span className={`dl-bar-val ${tone(v)}`}>
                    {signed(v, barMode === "pct" ? 1 : 2)}
                    {barMode === "pct" ? "%" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
