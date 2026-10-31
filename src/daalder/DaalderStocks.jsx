import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);

const signed = (n, digits = 2) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "never";

export default function DaalderStocks({ classInfo, students, currency, onChanged }) {
  const classId = classInfo.id;
  const [stocks, setStocks] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const ids = students.map((s) => s.id);
    const [stockRes, holdRes, orderRes] = await Promise.all([
      supabase
        .from("daalder_stocks")
        .select("symbol, name, price, prev_close, updated_at")
        .eq("active", true)
        .order("sort")
        .order("symbol"),
      ids.length
        ? supabase.from("daalder_holdings").select("student_id, symbol, shares, cost").in("student_id", ids)
        : Promise.resolve({ data: [] }),
      supabase
        .from("daalder_stock_orders")
        .select("id, student_id, symbol, side, amount, shares, cost")
        .eq("class_id", classId)
        .eq("status", "pending"),
    ]);
    const firstError = stockRes.error || holdRes.error || orderRes.error;
    if (firstError) return setError(firstError.message);
    setStocks(stockRes.data);
    setHoldings(holdRes.data);
    setOrders(orderRes.data);
  }, [classId, students]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setError("");
    setNotice("");
  }, [classId]);

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleMarket(on) {
    run(async () => {
      const { error } = await supabase.rpc("daalder_set_stocks_enabled", { p_class: classId, p_on: on });
      if (error) throw error;
      setNotice(on ? "Students in this class can now buy stocks." : "Buying is off. Students can still sell what they own.");
      onChanged?.();
    });
  }

  function updatePrices() {
    run(async () => {
      const { data, error } = await supabase.functions.invoke("daalder-prices", { body: {} });
      if (error) {
        let msg = error.message;
        try {
          msg = (await error.context.json()).error ?? msg;
        } catch {}
        throw new Error(msg);
      }
      const failedText = data.failed?.length
        ? ` Couldn't update: ${data.failed.map((f) => f.symbol).join(", ")}.`
        : "";
      setNotice(
        `Updated ${data.updated.length} price${data.updated.length === 1 ? "" : "s"}. ` +
          `${data.filled} order${data.filled === 1 ? "" : "s"} went through.${failedText}`
      );
      await load();
      onChanged?.();
    });
  }

  // ---------- Class summary ----------
  const priceOf = (sym) => Number(stocks.find((s) => s.symbol === sym)?.price ?? 0);
  const lastUpdate = stocks.reduce((latest, s) => (s.updated_at > (latest ?? "") ? s.updated_at : latest), null);

  const rows = students
    .map((s) => {
      const mine = holdings.filter((h) => h.student_id === s.id && Number(h.shares) > 0);
      const waiting = orders.filter((o) => o.student_id === s.id);
      let value = mine.reduce((sum, h) => sum + Number(h.shares) * priceOf(h.symbol), 0);
      let cost = mine.reduce((sum, h) => sum + Number(h.cost), 0);
      for (const o of waiting) {
        if (o.side === "buy") {
          value += Number(o.amount);
          cost += Number(o.amount);
        } else {
          value += Number(o.shares) * priceOf(o.symbol);
          cost += Number(o.cost ?? 0);
        }
      }
      const symbols = [...new Set([...mine.map((h) => h.symbol), ...waiting.map((o) => o.symbol)])];
      return { id: s.id, nickname: s.nickname, value, gain: value - cost, symbols, waiting: waiting.length };
    })
    .filter((r) => r.value > 0 || r.waiting > 0)
    .sort((a, b) => b.value - a.value);

  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  const investors = rows.length;

  return (
    <div>
      {error && <div className="dl-error" role="alert">{error}</div>}
      {notice && <div className="dl-notice" role="status">{notice}</div>}

      <section className="dl-panel">
        <h2>Stock market</h2>
        <label className="dl-check">
          <input
            type="checkbox"
            checked={!!classInfo.stocks_enabled}
            onChange={(e) => toggleMarket(e.target.checked)}
            disabled={busy}
          />
          <span>Students in this class can buy stocks</span>
        </label>
        <p className="dl-note">
          Prices are real, 1 {currency} = $1, and students can buy fractions of a share. Orders go through at the next
          price update (every 30 minutes on weekdays), so nobody can trade on a price they already know. Students can
          always sell what they own, even when buying is off.
        </p>
      </section>

      <section className="dl-panel">
        <div className="dl-row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Prices</h2>
          <div className="dl-row">
            <span className="dl-muted">Last update: {when(lastUpdate)}</span>
            <button className="dl-btn quiet small" onClick={updatePrices} disabled={busy}>
              {busy ? "Working…" : "Update prices now"}
            </button>
          </div>
        </div>
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Stock</th>
                <th className="num">Price</th>
                <th className="num">Today</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => {
                const change = s.price != null ? pct(Number(s.price), Number(s.prev_close)) : null;
                return (
                  <tr key={s.symbol}>
                    <td>
                      {s.name} <span className="dl-muted">{s.symbol}</span>
                    </td>
                    <td className="num">{s.price != null ? fmt(s.price) : "No price yet"}</td>
                    <td className={`num ${change > 0 ? "dl-up" : change < 0 ? "dl-down" : ""}`}>
                      {change != null ? `${signed(change)}%` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dl-panel">
        <h2>Class investments</h2>
        {investors === 0 ? (
          <p className="dl-muted" style={{ margin: 0 }}>No one has invested yet.</p>
        ) : (
          <>
            <p className="dl-muted" style={{ marginTop: 0 }}>
              {investors} of {students.length} students invested · {fmt(totalValue)} {currency} in stocks
            </p>
            <div className="dl-table-wrap">
              <table className="dl-table">
                <thead>
                  <tr>
                    <th>Nickname</th>
                    <th>Owns</th>
                    <th className="num">Value</th>
                    <th className="num">Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.nickname}</td>
                      <td>
                        {r.symbols.join(", ")}
                        {r.waiting > 0 && <span className="dl-muted"> · {r.waiting} waiting</span>}
                      </td>
                      <td className="num">{fmt(r.value)}</td>
                      <td className={`num ${r.gain > 0.004 ? "dl-up" : r.gain < -0.004 ? "dl-down" : ""}`}>
                        {signed(r.gain)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
