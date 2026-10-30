import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
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
};

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

  // RLS only ever returns this student's own row, transactions, and jobs.
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("daalder_students")
      .select("id, nickname, balance, class_id, daalder_classes(name, currency_name, base_pay, payday_dow, auto_payday)")
      .single();
    if (error) return setError("Couldn't load your account. Try signing in again.");
    setError("");
    setMe(data);

    const [tx, desks, jobRows] = await Promise.all([
      supabase
        .from("daalder_transactions")
        .select("id, amount, kind, note, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.rpc("daalder_desk_map", { p_class: data.class_id }),
      supabase.from("daalder_job_assignments").select("job_id, daalder_jobs(title, salary)"),
    ]);

    setHistory(tx.data ?? []);
    const mine = (desks.data ?? []).filter((d) => d.is_mine);
    setAssets(mine.reduce((sum, d) => sum + Number(d.price), 0));
    setDeskCount(mine.length);
    setJobs((jobRows.data ?? []).map((j) => j.daalder_jobs).filter(Boolean));
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

  useEffect(() => {
    if (!arrival) return;
    const t = setTimeout(() => setArrival(null), 6000);
    return () => clearTimeout(t);
  }, [arrival]);

  async function signOut() {
    await supabase.auth.signOut();
    onSignOut?.();
  }

  const currency = me?.daalder_classes?.currency_name ?? "Munt";
  const savings = Number(me?.balance ?? 0);
  const netWorth = savings + assets;
  const basePay = Number(me?.daalder_classes?.base_pay ?? 0);
  const autoPayday = !!me?.daalder_classes?.auto_payday;
  const paydayName = PAYDAY[me?.daalder_classes?.payday_dow];

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
                    <strong>{fmt(assets)}</strong>
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
