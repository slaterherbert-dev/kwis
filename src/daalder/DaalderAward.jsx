import { useEffect, useState } from "react";
import { supabase } from "../supabase";

// Quick reasons. Edit labels and amounts here to fit your room.
// Daalder is positive-only: every reason gives Munt, none take it away.
const PRESETS = [
  { label: "Participation", amount: 5 },
  { label: "On time", amount: 3 },
  { label: "Helped a classmate", amount: 5 },
  { label: "Great work", amount: 10 },
  { label: "Leadership", amount: 5 },
  { label: "Persistence", amount: 5 },
];

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function DaalderAward({ students, currency, onChanged, onAddStudents }) {
  const [selected, setSelected] = useState(() => new Set());
  const [customAmount, setCustomAmount] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null); // { text, txIds }

  // Hide the confirmation after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (students.length === 0) {
    return (
      <div className="dl-panel">
        <h2>No students yet</h2>
        <p className="dl-muted">Add nicknames on the Students tab, then come back here to give Munt.</p>
        <button className="dl-btn" onClick={onAddStudents}>Add students</button>
      </div>
    );
  }

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = selected.size === students.length;
  const selectAll = () => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));

  async function apply(amount, label) {
    const ids = [...selected];
    if (ids.length === 0) return setError("Tap at least one student first.");
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter an amount greater than zero.");

    setBusy(true);
    setError("");
    const { data: txIds, error } = await supabase.rpc("daalder_award", {
      p_student_ids: ids,
      p_amount: value,
      p_kind: "award",
      p_note: label,
    });
    setBusy(false);
    if (error) return setError(error.message);

    const who = ids.length === 1
      ? students.find((s) => s.id === ids[0])?.nickname
      : `${ids.length} students`;
    setToast({ text: `Gave ${who} ${fmt(value)} ${currency} for ${label}.`, txIds });
    setSelected(new Set());
    setCustomAmount("");
    setCustomNote("");
    onChanged?.();
  }

  // Reverses exactly the awards just given (allowed for 15 minutes).
  async function undo() {
    const { txIds } = toast;
    setToast(null);
    setBusy(true);
    const { error } = await supabase.rpc("daalder_undo", { p_tx_ids: txIds });
    setBusy(false);
    if (error) setError(error.message);
    onChanged?.();
  }

  const nothingSelected = selected.size === 0;

  return (
    <div>
      <div className="dl-row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <span className="dl-muted">
          {nothingSelected ? "Tap students to select them." : `${selected.size} selected`}
        </span>
        <button className="dl-btn quiet small" onClick={selectAll}>
          {allSelected ? "Clear selection" : "Select all"}
        </button>
      </div>

      <div className="dl-tiles">
        {students.map((s) => (
          <button
            key={s.id}
            className="dl-tile"
            aria-pressed={selected.has(s.id)}
            onClick={() => toggle(s.id)}
          >
            <span className="nick">{s.nickname}</span>
            <span className="bal">{fmt(s.balance)} {currency}</span>
          </button>
        ))}
      </div>

      <div className="dl-award-bar">
        {toast && (
          <div className="dl-toast" role="status">
            <span>{toast.text}</span>
            <button className="dl-btn quiet small" onClick={undo} disabled={busy}>Undo</button>
          </div>
        )}
        {error && <div className="dl-error" role="alert">{error}</div>}

        <h3>{nothingSelected ? "Select students, then choose a reason" : "Choose a reason"}</h3>
        <div className="dl-chips">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="dl-chip"
              onClick={() => apply(p.amount, p.label)}
              disabled={busy || nothingSelected}
            >
              {p.label}
              <span className="amt">+{p.amount}</span>
            </button>
          ))}
        </div>

        <div className="dl-award-custom">
          <input
            className="dl-input"
            type="number"
            min="1"
            step="1"
            inputMode="decimal"
            placeholder="Amount"
            aria-label="Custom amount"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
          <input
            className="dl-input note"
            placeholder="Reason (optional)"
            aria-label="Custom reason"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
          />
          <button
            className="dl-btn"
            disabled={busy || nothingSelected}
            onClick={() => apply(customAmount, customNote.trim() || "Bonus")}
          >
            Give
          </button>
        </div>
      </div>
    </div>
  );
}
