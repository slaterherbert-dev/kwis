import { useState } from "react";
import { supabase } from "../supabase";

// CD and bond terms. Must match _daalder_term_rate in daalder_v6_bank.sql.
export const TERMS = {
  cd: [
    { weeks: 2, bonus: 0 },
    { weeks: 4, bonus: 0.25 },
    { weeks: 8, bonus: 0.5 },
  ],
  bond: [
    { weeks: 4, bonus: 0 },
    { weeks: 8, bonus: 0.25 },
    { weeks: 16, bonus: 0.5 },
  ],
};
export const termRate = (base, bonus) => (Number(base) > 0 ? Number(base) + bonus : 0);

// What a CD pays at the end (interest grows on itself every week).
export const cdPayout = (amount, rate, weeks) => amount * Math.pow(1 + rate / 100, weeks);

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctText = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const dateText = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const inWeeks = (weeks) => {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d;
};

const BANK_ERRORS = {
  "Not enough Munt": "Not enough Munt in checking. / No tienes suficiente en cheques.",
  "Not enough in savings": "Not enough in savings. / No tienes suficiente en ahorros.",
  "Put in at least 5 Munt": "Put in at least 5 Munt. / Pon al menos 5 Munt.",
  "Enter an amount": "Enter an amount. / Escribe una cantidad.",
};

const KIND = {
  cd: {
    name: "CD",
    es: "Certificado de depósito",
    about:
      "Lock your Munt for a few weeks. Interest grows on itself and is paid at the end. You can cash out early, but then you get no interest.",
    aboutEs: "Guarda tu dinero unas semanas. Si lo sacas antes, no ganas interés.",
  },
  bond: {
    name: "Bond",
    es: "Bono del gobierno",
    about:
      "Lend Munt to the government. You get interest every payday and all your Munt back at the end. Bonds can't be cashed early.",
    aboutEs: "Le prestas dinero al gobierno. Te paga interés cada día de pago.",
  },
};

// Student bank: checking and savings, transfers, CDs and bonds.
export default function DaalderBank({ checking, savings, rates, deposits, currency, onChanged }) {
  const [moveAmt, setMoveAmt] = useState("");
  const [kind, setKind] = useState("cd");
  const [weeks, setWeeks] = useState(TERMS.cd[1].weeks);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const savingsRate = Number(rates.savings_rate ?? 0);
  const baseFor = (k) => Number(k === "cd" ? rates.cd_rate : rates.bond_rate) || 0;
  const term = TERMS[kind].find((t) => t.weeks === weeks) ?? TERMS[kind][0];
  const rate = termRate(baseFor(kind), term.bonus);
  const amt = Number(amount);

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(BANK_ERRORS[e.message] ?? e.message);
    } finally {
      setBusy(false);
      onChanged?.();
    }
  }

  function move(to) {
    const value = Number(moveAmt);
    if (!(value > 0)) return setError(BANK_ERRORS["Enter an amount"]);
    run(async () => {
      const { error } = await supabase.rpc("daalder_transfer", { p_amount: value, p_to: to });
      if (error) throw error;
      setMoveAmt("");
      setNotice(to === "savings" ? "Moved to savings. / Pasado a ahorros." : "Moved to checking. / Pasado a cheques.");
    });
  }

  function pickKind(k) {
    setKind(k);
    setWeeks(TERMS[k][1].weeks);
    setError("");
  }

  function open() {
    if (!(amt >= 5)) return setError(BANK_ERRORS["Put in at least 5 Munt"]);
    if (amt > checking) return setError(BANK_ERRORS["Not enough Munt"]);
    const label = kind === "cd" ? "CD" : "bond";
    const ok = window.confirm(
      `Put ${fmt(amt)} ${currency} in a ${weeks}-week ${label} at ${pctText(rate)} a week?\n` +
        (kind === "cd"
          ? "You can cash a CD early, but then you get no interest."
          : "Bonds can't be cashed early.")
    );
    if (!ok) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_open_deposit", { p_kind: kind, p_weeks: weeks, p_amount: amt });
      if (error) throw error;
      setAmount("");
      setNotice(kind === "cd" ? "CD opened! / ¡CD abierto!" : "Bond bought! / ¡Bono comprado!");
    });
  }

  function cashEarly(d) {
    const ok = window.confirm(
      `Cash this CD early?\nYou get your ${fmt(d.principal)} ${currency} back, but no interest. ` +
        `If you wait until it ends, you get ${fmt(cdPayout(Number(d.principal), Number(d.rate), d.weeks))}.`
    );
    if (!ok) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_cash_cd_early", { p_deposit: d.id });
      if (error) throw error;
      setNotice("CD cashed. The Munt is back in checking. / CD cobrado.");
    });
  }

  return (
    <section className="dl-panel">
      <h2>Bank<small>Banco</small></h2>

      <div className="dl-accounts">
        <div className="dl-account">
          <span className="dl-bank-label">Checking · Cheques</span>
          <strong>{fmt(checking)}</strong>
          <span className="dl-note">For spending · Para gastar</span>
        </div>
        <div className="dl-account savings">
          <span className="dl-bank-label">Savings · Ahorros</span>
          <strong>{fmt(savings)}</strong>
          <span className="dl-note">
            {savingsRate > 0
              ? `Earns ${pctText(savingsRate)} a week · Gana ${pctText(savingsRate)} por semana`
              : "No interest right now · Sin interés por ahora"}
          </span>
        </div>
      </div>

      {error && <div className="dl-error" role="alert" style={{ marginTop: "0.75rem" }}>{error}</div>}
      {notice && <div className="dl-notice" role="status" style={{ marginTop: "0.75rem" }}>{notice}</div>}

      <div className="dl-trade-row">
        <input
          className="dl-input"
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          placeholder={currency}
          aria-label="Amount to move"
          value={moveAmt}
          onChange={(e) => setMoveAmt(e.target.value)}
        />
        <button className="dl-btn small" onClick={() => move("savings")} disabled={busy}>
          To savings · A ahorros
        </button>
        <button className="dl-btn quiet small" onClick={() => move("checking")} disabled={busy}>
          To checking · A cheques
        </button>
      </div>
      <p className="dl-note">
        Savings interest is paid every payday, on the lowest amount your savings had that week. Leave it in to earn.
      </p>

      <h3 className="dl-subhead" style={{ marginTop: "1.25rem" }}>CDs and bonds · CDs y bonos</h3>

      {deposits.length > 0 && (
        <ul className="dl-orders" style={{ marginBottom: "1rem" }}>
          {deposits.map((d) => {
            const ends = dateText(new Date(`${d.matures_on}T12:00:00`));
            const p = Number(d.principal);
            const r = Number(d.rate);
            return (
              <li key={d.id}>
                <div>
                  <strong>
                    {d.kind === "cd" ? "CD" : "Bond · Bono"} · {fmt(p)} {currency}
                  </strong>
                  <span className="dl-order-meta">
                    {d.weeks} weeks at {pctText(r)} a week · ends {ends}
                  </span>
                  <span className="dl-order-meta">
                    {d.kind === "cd"
                      ? `You'll get ${fmt(cdPayout(p, r, d.weeks))} at the end · Recibirás ${fmt(cdPayout(p, r, d.weeks))}`
                      : `Pays ${fmt((p * r) / 100)} every payday (${d.coupons_paid} of ${d.weeks} paid), then ${fmt(p)} back`}
                  </span>
                </div>
                {d.kind === "cd" && (
                  <button className="dl-btn quiet small" onClick={() => cashEarly(d)} disabled={busy}>
                    Cash early
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="dl-segment" role="group" aria-label="CD or bond">
        {["cd", "bond"].map((k) => (
          <button key={k} className="dl-seg" aria-pressed={kind === k} onClick={() => pickKind(k)}>
            {KIND[k].name}
            <small>{KIND[k].es}</small>
          </button>
        ))}
      </div>
      <p className="dl-note">
        {KIND[kind].about} · {KIND[kind].aboutEs}
      </p>

      <div className="dl-chips" style={{ marginTop: "0.75rem" }} role="group" aria-label="How long">
        {TERMS[kind].map((t) => (
          <button
            key={t.weeks}
            className="dl-chip dl-term"
            aria-pressed={t.weeks === weeks}
            onClick={() => setWeeks(t.weeks)}
          >
            {t.weeks} weeks
            <span className="amt">{pctText(termRate(baseFor(kind), t.bonus))}/wk</span>
          </button>
        ))}
      </div>

      <div className="dl-trade-row">
        <input
          className="dl-input"
          type="number"
          min="5"
          step="1"
          inputMode="decimal"
          placeholder={currency}
          aria-label={kind === "cd" ? "Amount for the CD" : "Amount for the bond"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="dl-btn small" onClick={open} disabled={busy || rate <= 0}>
          {kind === "cd" ? "Open CD · Abrir" : "Buy bond · Comprar"}
        </button>
      </div>
      {rate <= 0 && <p className="dl-note">Your teacher has paused interest on these for now.</p>}
      {amt >= 5 && rate > 0 && (
        <p className="dl-preview">
          {kind === "cd"
            ? `On ${dateText(inWeeks(weeks))} you get ${fmt(cdPayout(amt, rate, weeks))} ${currency}: your ${fmt(amt)} plus ${fmt(
                cdPayout(amt, rate, weeks) - amt
              )} interest.`
            : `You get ${fmt((amt * rate) / 100)} every payday (${fmt(((amt * rate) / 100) * weeks)} total), and your ${fmt(
                amt
              )} back on ${dateText(inWeeks(weeks))}.`}
        </p>
      )}
    </section>
  );
}
