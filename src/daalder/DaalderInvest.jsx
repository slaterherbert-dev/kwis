import { useState } from "react";
import { supabase } from "../supabase";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtShares = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const signed = (n, digits = 2) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

const tone = (n) => (n > 0.004 ? "dl-up" : n < -0.004 ? "dl-down" : "");

// Friendlier versions of the database's trading errors.
const TRADE_ERRORS = {
  "Not enough Munt": "Not enough Munt in checking. / No tienes suficiente en cheques.",
  "Not enough shares": "You don't own that many shares. / No tienes tantas acciones.",
  "The stock market is closed for this class":
    "Buying is closed right now. You can still sell. / La compra está cerrada.",
  "No price yet": "This stock doesn't have a price yet. Try later. / Todavía no tiene precio.",
  "Invest at least 1 Munt": "Invest at least 1 Munt. / Invierte al menos 1 Munt.",
  "This order already went through": "That order already went through. / Esa orden ya se completó.",
};

// Student investing: market list, holdings, waiting orders.
// The parent (DaalderStudentHome) loads the data so net worth can include investments.
export default function DaalderInvest({ stocks, holdings, orders, savings, currency, enabled, onChanged }) {
  const [open, setOpen] = useState(null); // symbol being traded
  const [buyAmt, setBuyAmt] = useState("");
  const [sellAmt, setSellAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const stockOf = (sym) => stocks.find((s) => s.symbol === sym);
  const priceOf = (sym) => Number(stockOf(sym)?.price ?? 0);
  const held = holdings.filter((h) => Number(h.shares) > 0);
  const holdingOf = (sym) => held.find((h) => h.symbol === sym);

  const value = held.reduce((sum, h) => sum + Number(h.shares) * priceOf(h.symbol), 0);
  const cost = held.reduce((sum, h) => sum + Number(h.cost), 0);
  const gain = value - cost;

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(TRADE_ERRORS[e.message] ?? e.message);
    } finally {
      setBusy(false);
      onChanged?.();
    }
  }

  function toggle(sym) {
    setOpen(open === sym ? null : sym);
    setBuyAmt("");
    setSellAmt("");
    setError("");
    setNotice("");
  }

  function buy(stock) {
    const amount = Number(buyAmt);
    if (!(amount >= 1)) return setError(TRADE_ERRORS["Invest at least 1 Munt"]);
    if (amount > savings) return setError(TRADE_ERRORS["Not enough Munt"]);
    if (!window.confirm(`Invest ${fmt(amount)} ${currency} in ${stock.name}?\nIt goes through at the next price update.`)) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_stock_buy", { p_symbol: stock.symbol, p_amount: amount });
      if (error) throw error;
      setBuyAmt("");
      setNotice("Order placed! It goes through at the next price update. / ¡Orden lista!");
    });
  }

  function sell(stock, all) {
    const h = holdingOf(stock.symbol);
    const price = priceOf(stock.symbol);
    let shares;
    if (all) {
      shares = Number(h.shares);
    } else {
      const amount = Number(sellAmt);
      if (!(amount > 0)) return setError("Enter how much to sell. / Escribe cuánto vender.");
      shares = Math.min(Number(h.shares), Math.round((amount / price) * 1e6) / 1e6);
    }
    const about = fmt(shares * price);
    const ok = window.confirm(
      `Sell ${fmtShares(shares)} share${shares === 1 ? "" : "s"} of ${stock.name} (about ${about} ${currency})?\n` +
        "The final amount depends on the price at the next update."
    );
    if (!ok) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_stock_sell", { p_symbol: stock.symbol, p_shares: shares });
      if (error) throw error;
      setSellAmt("");
      setNotice("Sell order placed! Munt arrives at the next price update. / ¡Orden de venta lista!");
    });
  }

  function cancel(order) {
    run(async () => {
      const { error } = await supabase.rpc("daalder_stock_cancel", { p_order: order.id });
      if (error) throw error;
      setNotice("Order canceled. / Orden cancelada.");
    });
  }

  return (
    <section className="dl-panel">
      <h2>Invest<small>Invertir</small></h2>

      {(held.length > 0 || orders.length > 0) && (
        <div className="dl-invest-sum">
          <div>
            <span className="dl-bank-label">My stocks · Mis acciones</span>
            <strong>{fmt(value)} {currency}</strong>
          </div>
          {held.length > 0 && (
            <div style={{ textAlign: "right" }}>
              <span className="dl-bank-label">Gain · Ganancia</span>
              <strong className={tone(gain)}>
                {signed(gain)}
                {cost > 0 && <small> ({signed((gain / cost) * 100, 1)}%)</small>}
              </strong>
            </div>
          )}
        </div>
      )}

      {error && <div className="dl-error" role="alert">{error}</div>}
      {notice && <div className="dl-notice" role="status">{notice}</div>}

      {orders.length > 0 && (
        <div className="dl-waiting" style={{ marginTop: 0, marginBottom: "1rem" }}>
          <strong>Waiting for the next price · Esperando el próximo precio</strong>
          <ul className="dl-orders">
            {orders.map((o) => (
              <li key={o.id}>
                <span>
                  {o.side === "buy"
                    ? `Buy ${fmt(o.amount)} ${currency} of ${o.symbol}`
                    : `Sell ${fmtShares(o.shares)} ${o.symbol}`}
                </span>
                <button className="dl-btn quiet small" onClick={() => cancel(o)} disabled={busy}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="dl-market">
        {stocks.map((s) => {
          const price = Number(s.price ?? 0);
          const change = s.price != null && s.prev_close > 0 ? ((price - s.prev_close) / s.prev_close) * 100 : null;
          const h = holdingOf(s.symbol);
          const isOpen = open === s.symbol;
          const hValue = h ? Number(h.shares) * price : 0;
          const hGain = h ? hValue - Number(h.cost) : 0;
          return (
            <li key={s.symbol}>
              <button className="dl-stock" aria-expanded={isOpen} onClick={() => toggle(s.symbol)}>
                <span>
                  <strong>{s.name}</strong>
                  <span className="sym">{s.symbol}</span>
                  <span className="about">{s.about}{s.about_es && s.about_es !== s.about ? ` · ${s.about_es}` : ""}</span>
                  {h && (
                    <span className="mine">
                      You own {fmtShares(h.shares)} · {fmt(hValue)} {currency}{" "}
                      <span className={tone(hGain)}>({signed(hGain)})</span>
                    </span>
                  )}
                </span>
                <span className="px">
                  {s.price != null ? fmt(price) : "—"}
                  {change != null && <small className={tone(change)}>{signed(change)}% today</small>}
                </span>
              </button>

              {isOpen && (
                <div className="dl-trade">
                  {s.price == null ? (
                    <p className="dl-muted" style={{ margin: 0 }}>No price yet. Check back after the next update.</p>
                  ) : (
                    <>
                      <p className="dl-note" style={{ marginTop: 0 }}>
                        1 share costs {fmt(price)} {currency}. You can buy part of a share.
                      </p>
                      {enabled ? (
                        <div className="dl-trade-row">
                          <input
                            className="dl-input"
                            type="number"
                            min="1"
                            step="1"
                            inputMode="decimal"
                            placeholder={currency}
                            aria-label={`Munt to invest in ${s.name}`}
                            value={buyAmt}
                            onChange={(e) => setBuyAmt(e.target.value)}
                          />
                          <button className="dl-btn small" onClick={() => buy(s)} disabled={busy}>
                            Buy · Comprar
                          </button>
                          {Number(buyAmt) > 0 && (
                            <span className="dl-muted">≈ {fmtShares(Number(buyAmt) / price)} shares</span>
                          )}
                        </div>
                      ) : (
                        <p className="dl-muted" style={{ margin: 0 }}>Buying is closed right now. · La compra está cerrada.</p>
                      )}
                      {h && (
                        <div className="dl-trade-row">
                          <input
                            className="dl-input"
                            type="number"
                            min="1"
                            step="1"
                            inputMode="decimal"
                            placeholder={currency}
                            aria-label={`Munt worth of ${s.name} to sell`}
                            value={sellAmt}
                            onChange={(e) => setSellAmt(e.target.value)}
                          />
                          <button className="dl-btn quiet small" onClick={() => sell(s, false)} disabled={busy}>
                            Sell · Vender
                          </button>
                          <button className="dl-btn quiet small" onClick={() => sell(s, true)} disabled={busy}>
                            Sell all
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="dl-note">
        Real prices from the stock market, updated every 30 minutes on school days. 1 {currency} = $1. Prices go up and
        down, so your stocks can be worth more or less than you paid. · Los precios suben y bajan.
      </p>
    </section>
  );
}
