import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { TERMS, termRate } from "./DaalderBank";

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctText = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
// What a weekly rate adds up to over a year, compounded weekly.
const yearly = (weekly) => (Math.pow(1 + Number(weekly) / 100, 52) - 1) * 100;

const DAYS = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday" };

export default function DaalderBankTeacher({ classInfo, students, currency, onChanged }) {
  const classId = classInfo.id;
  const [rates, setRates] = useState({ savings: "", cd: "", bond: "" });
  const [deposits, setDeposits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setRates({
      savings: String(classInfo.savings_rate ?? 1),
      cd: String(classInfo.cd_rate ?? 2),
      bond: String(classInfo.bond_rate ?? 1.5),
    });
  }, [classInfo.id, classInfo.savings_rate, classInfo.cd_rate, classInfo.bond_rate]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("daalder_deposits")
      .select("student_id, kind, principal")
      .eq("class_id", classId)
      .eq("status", "active");
    if (error) return setError(error.message);
    setDeposits(data);
  }, [classId]);

  useEffect(() => {
    setError("");
    setNotice("");
    load();
  }, [load]);

  const dirty =
    Number(rates.savings) !== Number(classInfo.savings_rate) ||
    Number(rates.cd) !== Number(classInfo.cd_rate) ||
    Number(rates.bond) !== Number(classInfo.bond_rate);

  async function save() {
    const s = Number(rates.savings);
    const c = Number(rates.cd);
    const b = Number(rates.bond);
    if ([rates.savings, rates.cd, rates.bond].some((v) => v === "") || [s, c, b].some((v) => !(v >= 0 && v <= 10))) {
      return setError("Each rate must be between 0 and 10 percent a week.");
    }
    setBusy(true);
    setError("");
    setNotice("");
    const { error } = await supabase.rpc("daalder_set_bank_rates", {
      p_class: classId,
      p_savings: s,
      p_cd: c,
      p_bond: b,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setNotice("Rates saved. CDs and bonds already open keep the rate they started with.");
    onChanged?.();
  }

  const field = (key, label) => (
    <label className="dl-field">
      <span>{label}</span>
      <span className="dl-row" style={{ fontWeight: 400 }}>
        <input
          className="dl-input"
          style={{ width: "6rem" }}
          type="number"
          min="0"
          max="10"
          step="0.25"
          value={rates[key]}
          onChange={(e) => setRates({ ...rates, [key]: e.target.value })}
        />
        % a week
      </span>
      {rates[key] !== "" && Number(rates[key]) > 0 && (
        <small>≈ {pctText(Math.round(yearly(rates[key])))} a year</small>
      )}
    </label>
  );

  // ---------- Class overview ----------
  const sum = (id, kind) =>
    deposits.filter((d) => d.student_id === id && d.kind === kind).reduce((s, d) => s + Number(d.principal), 0);
  const rows = students.map((s) => ({
    id: s.id,
    nickname: s.nickname,
    checking: Number(s.balance),
    savings: Number(s.savings ?? 0),
    cd: sum(s.id, "cd"),
    bond: sum(s.id, "bond"),
  }));
  const totals = rows.reduce(
    (t, r) => ({
      checking: t.checking + r.checking,
      savings: t.savings + r.savings,
      cd: t.cd + r.cd,
      bond: t.bond + r.bond,
    }),
    { checking: 0, savings: 0, cd: 0, bond: 0 }
  );
  const savers = rows.filter((r) => r.savings > 0 || r.cd > 0 || r.bond > 0).length;
  const payday = DAYS[classInfo.payday_dow] ?? "payday";

  return (
    <div>
      {error && <div className="dl-error" role="alert">{error}</div>}
      {notice && <div className="dl-notice" role="status">{notice}</div>}

      <section className="dl-panel">
        <h2>Interest rates</h2>
        <p className="dl-note" style={{ marginTop: 0, marginBottom: "1rem" }}>
          Interest is paid every {payday} morning (your payday). Rates are per week, so growth is visible within a
          semester; the yearly equivalent is shown for comparing with real banks. Set a rate to 0 to pause it.
        </p>
        <div className="dl-payday-grid" style={{ maxWidth: "40rem" }}>
          {field("savings", "Savings")}
          {field("cd", "CDs (shortest term)")}
          {field("bond", "Bonds (shortest term)")}
        </div>
        <p className="dl-note">
          Longer terms earn more:{" "}
          {TERMS.cd.map((t) => `${t.weeks}-week CD ${pctText(termRate(rates.cd, t.bonus))}`).join(", ")};{" "}
          {TERMS.bond.map((t) => `${t.weeks}-week bond ${pctText(termRate(rates.bond, t.bonus))}`).join(", ")}.
        </p>
        <div className="dl-row" style={{ marginTop: "0.9rem" }}>
          <button className="dl-btn" onClick={save} disabled={busy || !dirty}>Save rates</button>
        </div>
      </section>

      <section className="dl-panel">
        <h2>Class bank</h2>
        <p className="dl-muted" style={{ marginTop: 0 }}>
          {savers} of {students.length} students are saving · {fmt(totals.savings + totals.cd + totals.bond)} {currency}{" "}
          in savings, CDs, and bonds
        </p>
        <div className="dl-table-wrap">
          <table className="dl-table">
            <thead>
              <tr>
                <th>Nickname</th>
                <th className="num">Checking</th>
                <th className="num">Savings</th>
                <th className="num">CDs</th>
                <th className="num">Bonds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.nickname}</td>
                  <td className="num">{fmt(r.checking)}</td>
                  <td className="num">{fmt(r.savings)}</td>
                  <td className="num">{r.cd ? fmt(r.cd) : ""}</td>
                  <td className="num">{r.bond ? fmt(r.bond) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
