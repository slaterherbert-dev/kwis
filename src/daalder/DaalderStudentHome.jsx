import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import DaalderInvest from "./DaalderInvest";
import "./daalder.css";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// How each kind of transaction is labeled for students (English, then Spanish).
const KIND_LABEL = {
  award: "Award / Premio",
  salary: "Paycheck / Pago",
  purchase: "Purchase / Compra",
  game: "Kwis game / Juego de Kwis",
  desk_buy: "Desk / Escritorio",
  adjustment: "Correction / Corrección",
  refund: "Refund / Reembolso",
  desk_sell: "Desk sold / Escritorio vendido",
  invest: "Investment / Inversión",
  stock_sale: "Stock sale / Venta de acciones",
};

// Friendlier versions of the database's buying errors.
const BUY_ERRORS = {
  "Not enough Munt": "Not enough Munt yet. / Todavía no tienes suficiente.",
  "Sold out": "Sold out. / Agotado.",
  "Item not available": "That item isn't in the shop anymore. / Ya no está en la tienda.",
  "Desk already owned": "Someone just bought that desk. / Alguien ya lo compró.",
  "Desk not found": "That desk isn't on the map anymore. / Ya no está en el mapa.",
};

const ROW = (y) => String.fromCharCode(65 + y);

// Payday names (1 = Monday ... 5 = Friday), English then Spanish.
const PAYDAY = {
  1: "Monday / lunes",
  2: "Tuesday / martes",
  3: "Wednesday / miércoles",
  4: "Thursday / jueves",
  5: "Friday / viernes",
};

export default function DaalderStudentHome({ onSignOut }) {
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);
  const [assets, setAssets] = useState(0);
  const [deskCount, setDeskCount] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [arrival, setArrival] = useState(null); // newest transaction, shown briefly
  const [error, setError] = useState("");
  const [shop, setShop] = useState([]);
  const [orders, setOrders] = useState([]);
  const [buying, setBuying] = useState(null); // item id being bought
  const [shopError, setShopError] = useState("");
  const [deskMap, setDeskMap] = useState([]);
  const [pickedDesk, setPickedDesk] = useState(null); // desk_id
  const [deskBusy, setDeskBusy] = useState(false);
  const [deskError, setDeskError] = useState("");
  const [stocks, setStocks] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [stockOrders, setStockOrders] = useState([]);

  // RLS only ever returns this student's own row, transactions, and jobs.
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("daalder_students")
      .select("id, nickname, balance, class_id, daalder_classes(name, currency_name, base_pay, payday_dow, auto_payday, desk_cols, desk_rows, stocks_enabled)")
      .single();
    if (error) return setError("Couldn't load your account. Try signing in again.");
    setError("");
    setMe(data);

    const [tx, desks, jobRows, items, pending, stockRows, holdRows, orderRows] = await Promise.all([
      supabase
        .from("daalder_transactions")
        .select("id, amount, kind, note, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.rpc("daalder_desk_map", { p_class: data.class_id }),
      supabase.from("daalder_job_assignments").select("job_id, daalder_jobs(title, salary)"),
      supabase.from("daalder_store_items").select("id, name, price, quantity").order("price").order("name"),
      supabase
        .from("daalder_purchases")
        .select("id, item_name, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("daalder_stocks")
        .select("symbol, name, about, about_es, price, prev_close")
        .eq("active", true)
        .order("sort")
        .order("symbol"),
      supabase.from("daalder_holdings").select("symbol, shares, cost"),
      supabase
        .from("daalder_stock_orders")
        .select("id, symbol, side, amount, shares, cost")
        .eq("status", "pending")
        .order("id"),
    ]);

    setHistory(tx.data ?? []);
    setDeskMap(desks.data ?? []);
    const mine = (desks.data ?? []).filter((d) => d.is_mine);
    setAssets(mine.reduce((sum, d) => sum + Number(d.price), 0));
    setDeskCount(mine.length);
    setJobs((jobRows.data ?? []).map((j) => j.daalder_jobs).filter(Boolean));
    setShop(items.data ?? []);
    setOrders(pending.data ?? []);
    setStocks(stockRows.data ?? []);
    setHoldings(holdRows.data ?? []);
    setStockOrders(orderRows.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: when the teacher gives or takes Munt, the card updates by itself.
  useEffect(() => {
    if (!me?.id) return;
    const channel = supabase
      .channel(`daalder-student-${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "daalder_transactions", filter: `student_id=eq.${me.id}` },
        (payload) => {
          setArrival({ ...payload.new, key: Date.now() });
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.id, load]);

  // Backup for school networks that block live connections: refresh when the tab is reopened.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Stock orders go through every 30 minutes; check back every 5 while the page is open.
  const stocksOn = !!me?.daalder_classes?.stocks_enabled;
  useEffect(() => {
    if (!stocksOn) return;
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [stocksOn, load]);

  useEffect(() => {
    if (!arrival) return;
    const t = setTimeout(() => setArrival(null), 6000);
    return () => clearTimeout(t);
  }, [arrival]);

  async function buy(item) {
    setShopError("");
    if (!window.confirm(`Buy "${item.name}" for ${fmt(item.price)} ${currency}?`)) return;
    setBuying(item.id);
    const { error } = await supabase.rpc("daalder_buy_item", { p_item: item.id });
    setBuying(null);
    if (error) setShopError(BUY_ERRORS[error.message] ?? error.message);
    load();
  }

  async function buyDesk(d) {
    setDeskError("");
    if (!window.confirm(`Buy desk ${d.label} for ${fmt(d.price)} ${currency}?`)) return;
    setDeskBusy(true);
    const { error } = await supabase.rpc("daalder_buy_desk", { p_desk: d.desk_id });
    setDeskBusy(false);
    if (error) setDeskError(BUY_ERRORS[error.message] ?? error.message);
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    onSignOut?.();
  }

  const currency = me?.daalder_classes?.currency_name ?? "Munt";
  const savings = Number(me?.balance ?? 0);
  // Investments count toward assets, including orders still waiting to go through.
  const stockPrice = (sym) => Number(stocks.find((s) => s.symbol === sym)?.price ?? 0);
  const investValue =
    holdings.reduce((sum, h) => sum + Number(h.shares) * stockPrice(h.symbol), 0) +
    stockOrders.reduce(
      (sum, o) => sum + (o.side === "buy" ? Number(o.amount) : Number(o.shares) * stockPrice(o.symbol)),
      0
    );
  const totalAssets = assets + investValue;
  const netWorth = savings + totalAssets;
  const basePay = Number(me?.daalder_classes?.base_pay ?? 0);
  const autoPayday = !!me?.daalder_classes?.auto_payday;
  const paydayName = PAYDAY[me?.daalder_classes?.payday_dow];
  const deskCols = me?.daalder_classes?.desk_cols ?? 8;
  const deskRows = me?.daalder_classes?.desk_rows ?? 5;
  const deskAt = new Map(deskMap.map((d) => [`${d.grid_x},${d.grid_y}`, d]));
  const picked = deskMap.find((d) => d.desk_id === pickedDesk) ?? null;

  return (
    <div className="dl dl-page">
      <div className="dl-student">
        <div className="dl-student-top">
          <div className="dl-wordmark">
            <span className="dl-coin" aria-hidden="true" />
            Daalder
          </div>
          <button className="dl-btn quiet small" onClick={signOut}>Sign out</button>
        </div>

        {error && <div className="dl-error" role="alert">{error}</div>}

        {me && (
          <>
            <section className="dl-bank" aria-label="Your Daalder card">
              <div className="dl-bank-top">
                <div className="dl-wordmark">
                  <span className="dl-coin" aria-hidden="true" />
                  Daalder
                </div>
                <div className="dl-bank-class">{me.daalder_classes?.name}</div>
              </div>

              <div>
                <div className="dl-bank-label">
                  Net worth<small>Patrimonio</small>
                </div>
                <span key={arrival?.key} className={`dl-bank-big${arrival ? " dl-flash" : ""}`}>
                  {fmt(netWorth)}
                </span>
                <div className="dl-bank-label">{currency}</div>
              </div>

              <div className="dl-bank-bottom">
                <div className="dl-bank-name">{me.nickname}</div>
                <div className="dl-bank-stats">
                  <div>
                    <span className="dl-bank-label">Savings<small>Ahorros</small></span>
                    <strong>{fmt(savings)}</strong>
                  </div>
                  <div>
                    <span className="dl-bank-label">Assets<small>Bienes</small></span>
                    <strong>{fmt(totalAssets)}</strong>
                  </div>
                </div>
              </div>
            </section>

            {arrival && (
              <p className={`dl-arrival${arrival.amount < 0 ? " neg" : ""}`} role="status">
                {arrival.amount > 0 ? "+" : "−"}
                {fmt(Math.abs(arrival.amount))} {currency}
                {arrival.note ? `: ${arrival.note}` : ""}
              </p>
            )}

            <section className="dl-panel" style={{ marginTop: "1.25rem" }}>
              <h2>My job<small>Mi trabajo</small></h2>
              {(basePay > 0 || jobs.length > 0) && (
                <ul className="dl-activity">
                  {basePay > 0 && (
                    <li>
                      <span className="what">
                        Base pay<span className="kind">Pago base · everyone gets this</span>
                      </span>
                      <span className="amt pos">{fmt(basePay)} per payday</span>
                    </li>
                  )}
                  {jobs.map((j) => (
                    <li key={j.title}>
                      <span className="what">{j.title}</span>
                      <span className="amt pos">{fmt(j.salary)} per payday</span>
                    </li>
                  ))}
                </ul>
              )}
              {jobs.length === 0 && (
                <p className="dl-muted" style={{ margin: basePay > 0 ? "0.6rem 0 0" : 0 }}>
                  No job yet. Ask your teacher which jobs are open.
                </p>
              )}
              {autoPayday && paydayName && (
                <p className="dl-note">Payday · Día de pago: every {paydayName}</p>
              )}
              {deskCount > 0 && (
                <p className="dl-note">
                  You own {deskCount} desk{deskCount > 1 ? "s" : ""}, counted in your assets.
                </p>
              )}
            </section>

            <section className="dl-panel">
              <h2>Shop<small>Tienda</small></h2>
              {shopError && <div className="dl-error" role="alert">{shopError}</div>}
              {shop.length === 0 ? (
                <p className="dl-muted" style={{ margin: 0 }}>The shop is empty for now. Check back soon.</p>
              ) : (
                <ul className="dl-activity">
                  {shop.map((item) => {
                    const price = Number(item.price);
                    const soldOut = item.quantity != null && item.quantity <= 0;
                    return (
                      <li key={item.id}>
                        <span className="what">
                          {item.name}
                          {item.quantity != null && (
                            <span className="kind">
                              {soldOut ? "Sold out · Agotado" : `${item.quantity} left · Quedan ${item.quantity}`}
                            </span>
                          )}
                        </span>
                        <span className="dl-shop-buy">
                          <span className="amt">{fmt(price)}</span>
                          {soldOut ? null : savings >= price ? (
                            <button
                              className="dl-btn small"
                              onClick={() => buy(item)}
                              disabled={buying !== null}
                            >
                              {buying === item.id ? "Buying…" : "Buy · Comprar"}
                            </button>
                          ) : (
                            <span className="dl-shop-short">Save {fmt(price - savings)} more</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {orders.length > 0 && (
                <div className="dl-waiting">
                  <strong>Waiting for your teacher · Esperando al maestro</strong>
                  <ul>
                    {orders.map((o) => (
                      <li key={o.id}>{o.item_name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {(stocksOn || holdings.length > 0 || stockOrders.length > 0) && stocks.length > 0 && (
              <DaalderInvest
                stocks={stocks}
                holdings={holdings}
                orders={stockOrders}
                savings={savings}
                currency={currency}
                enabled={stocksOn}
                onChanged={load}
              />
            )}

            {deskMap.length > 0 && (
              <section className="dl-panel">
                <h2>Desks<small>Escritorios</small></h2>
                <div className="dl-room">
                  <div className="dl-room-front">Front of room · Frente del salón</div>
                  <div
                    className="dl-room-grid"
                    style={{ gridTemplateColumns: `repeat(${deskCols}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: deskRows }).flatMap((_, y) =>
                      Array.from({ length: deskCols }).map((__, x) => {
                        const d = deskAt.get(`${x},${y}`);
                        if (!d) return <div key={`${x},${y}`} className="dl-cell blank" aria-hidden="true" />;
                        const state = d.is_mine ? " mine" : d.owner_nickname ? " taken" : "";
                        return (
                          <button
                            key={d.desk_id}
                            className={`dl-cell dl-desk${state}`}
                            aria-pressed={d.desk_id === pickedDesk}
                            aria-label={`Desk ${d.label}, row ${ROW(y)}`}
                            onClick={() => {
                              setDeskError("");
                              setPickedDesk(d.desk_id === pickedDesk ? null : d.desk_id);
                            }}
                          >
                            <span className="lbl">{d.label}</span>
                            <span className="sub">
                              {d.is_mine ? "Yours" : d.owner_nickname ? d.owner_nickname : fmt(d.price)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="dl-legend">
                  <span><i />For sale · En venta</span>
                  <span><i className="mine" />Yours · Tuyo</span>
                  <span><i className="taken" />Owned · Vendido</span>
                </div>

                {deskError && <div className="dl-error" role="alert" style={{ marginTop: "0.75rem" }}>{deskError}</div>}

                {picked && (
                  <div className="dl-desk-detail row">
                    {picked.is_mine ? (
                      <span>
                        <strong>Desk {picked.label} is yours.</strong> It counts toward your assets. · Es tuyo.
                      </span>
                    ) : picked.owner_nickname ? (
                      <span>
                        <strong>Desk {picked.label}</strong> belongs to {picked.owner_nickname}.
                      </span>
                    ) : (
                      <>
                        <span>
                          <strong>Desk {picked.label}</strong> · {fmt(picked.price)} {currency}
                        </span>
                        {savings >= Number(picked.price) ? (
                          <button className="dl-btn small" onClick={() => buyDesk(picked)} disabled={deskBusy}>
                            {deskBusy ? "Buying…" : "Buy · Comprar"}
                          </button>
                        ) : (
                          <span className="dl-shop-short">
                            Save {fmt(Number(picked.price) - savings)} more · Te faltan {fmt(Number(picked.price) - savings)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="dl-panel">
              <h2>Recent activity<small>Actividad reciente</small></h2>
              {history.length === 0 ? (
                <p className="dl-muted" style={{ margin: 0 }}>Nothing yet. Munt you earn will show up here.</p>
              ) : (
                <ul className="dl-activity">
                  {history.map((t) => (
                    <li key={t.id}>
                      <span className="what">
                        {t.note || KIND_LABEL[t.kind]}
                        <span className="kind">
                          {KIND_LABEL[t.kind]} ·{" "}
                          {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </span>
                      <span className={`amt ${t.amount < 0 ? "neg" : "pos"}`}>
                        {t.amount > 0 ? "+" : "−"}
                        {fmt(Math.abs(t.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
