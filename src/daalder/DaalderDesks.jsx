import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

// Row letters from the front of the room: A, B, C...
const ROW = (y) => String.fromCharCode(65 + y);

// Starter room layouts. xs/ys are the map spots that get a desk; gaps are aisles.
const LAYOUTS = [
  { key: "rows", label: "Rows", cols: 7, rows: 5, xs: [0, 1, 2, 4, 5, 6], ys: [0, 1, 2, 3, 4] },
  { key: "pairs", label: "Pairs", cols: 8, rows: 5, xs: [0, 1, 3, 4, 6, 7], ys: [0, 1, 2, 3, 4] },
  { key: "groups", label: "Groups of 4", cols: 8, rows: 5, xs: [0, 1, 3, 4, 6, 7], ys: [0, 1, 3, 4] },
];

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Postgres 23505 = a unique rule was broken (same spot or same label).
const friendly = (e) =>
  e?.code === "23505" ? "There's already a desk there, or another desk has that label." : e?.message ?? String(e);

export default function DaalderDesks({ classInfo, students, currency, onChanged }) {
  const classId = classInfo.id;
  const cols = classInfo.desk_cols ?? 8;
  const rows = classInfo.desk_rows ?? 5;

  const [desks, setDesks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [price, setPrice] = useState("150");
  const [sizeCols, setSizeCols] = useState(String(cols));
  const [sizeRows, setSizeRows] = useState(String(rows));
  const [selectedId, setSelectedId] = useState(null);
  const [edit, setEdit] = useState({ label: "", price: "" });
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSizeCols(String(cols));
    setSizeRows(String(rows));
  }, [cols, rows]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("daalder_desks")
      .select("id, label, grid_x, grid_y, price, owner_student_id")
      .eq("class_id", classId);
    setLoaded(true);
    if (error) return setError(error.message);
    setDesks(data);
  }, [classId]);

  useEffect(() => {
    setSelectedId(null);
    setMoving(false);
    setError("");
    setNotice("");
    load();
  }, [load]);

  // Students buy desks on their own devices, so refresh when the teacher comes back.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const byCell = new Map(desks.map((d) => [`${d.grid_x},${d.grid_y}`, d]));
  const selected = desks.find((d) => d.id === selectedId) ?? null;
  const nameOf = (id) => students.find((s) => s.id === id)?.nickname ?? "a student";
  const ownedCount = desks.filter((d) => d.owner_student_id).length;

  // Next free label in a row: A1, A2, ...
  function nextLabel(y) {
    const letter = ROW(y);
    const taken = new Set(desks.map((d) => d.label));
    const nums = desks
      .map((d) => d.label)
      .filter((l) => new RegExp(`^${letter}\\d+$`).test(l))
      .map((l) => Number(l.slice(1)));
    let n = nums.length ? Math.max(...nums) + 1 : 1;
    while (taken.has(`${letter}${n}`)) n++;
    return `${letter}${n}`;
  }

  function defaultPrice() {
    const p = Number(price);
    if (!(p > 0)) {
      setError("Set a desk price greater than zero first.");
      return null;
    }
    return p;
  }

  // ---------- Map clicks ----------
  function clickEmpty(x, y) {
    if (moving && selected) {
      run(async () => {
        const { error } = await supabase.rpc("daalder_update_desk", {
          p_desk: selected.id,
          p_label: selected.label,
          p_x: x,
          p_y: y,
          p_price: selected.price,
        });
        if (error) throw error;
        setMoving(false);
        await load();
      });
      return;
    }
    const p = defaultPrice();
    if (p == null) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_add_desks", {
        p_class: classId,
        p_desks: [{ label: nextLabel(y), x, y, price: p }],
      });
      if (error) throw error;
      await load();
    });
  }

  function selectDesk(d) {
    setMoving(false);
    if (d.id === selectedId) return setSelectedId(null);
    setSelectedId(d.id);
    setEdit({ label: d.label, price: String(d.price) });
  }

  // ---------- Selected desk ----------
  function saveDesk() {
    const p = Number(edit.price);
    if (!edit.label.trim()) return setError("Give the desk a label.");
    if (!(p > 0)) return setError("Enter a price greater than zero.");
    run(async () => {
      const { error } = await supabase.rpc("daalder_update_desk", {
        p_desk: selected.id,
        p_label: edit.label,
        p_x: selected.grid_x,
        p_y: selected.grid_y,
        p_price: p,
      });
      if (error) throw error;
      await load();
    });
  }

  function removeDesk() {
    if (!window.confirm(`Remove desk ${selected.label} from the map?`)) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_delete_desk", { p_desk: selected.id });
      if (error) throw error;
      setSelectedId(null);
      await load();
    });
  }

  function buyBack() {
    const who = nameOf(selected.owner_student_id);
    const ok = window.confirm(
      `Buy desk ${selected.label} back from ${who}? They get the full ${fmt(selected.price)} ${currency} back.`
    );
    if (!ok) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_buy_back_desk", { p_desk: selected.id });
      if (error) throw error;
      setNotice(`${who} got ${fmt(selected.price)} ${currency} back for desk ${selected.label}.`);
      await load();
      onChanged?.();
    });
  }

  // ---------- Room setup ----------
  function applySize() {
    run(async () => {
      const { error } = await supabase.rpc("daalder_set_desk_grid", {
        p_class: classId,
        p_cols: Number(sizeCols),
        p_rows: Number(sizeRows),
      });
      if (error) throw error;
      onChanged?.();
    });
  }

  function applyLayout(layout) {
    const p = defaultPrice();
    if (p == null) return;
    const list = layout.ys.flatMap((y, row) =>
      layout.xs.map((x, i) => ({ label: `${ROW(row)}${i + 1}`, x, y, price: p }))
    );
    run(async () => {
      const grid = await supabase.rpc("daalder_set_desk_grid", {
        p_class: classId,
        p_cols: layout.cols,
        p_rows: layout.rows,
      });
      if (grid.error) throw grid.error;
      const { error } = await supabase.rpc("daalder_add_desks", { p_class: classId, p_desks: list });
      if (error) throw error;
      await load();
      onChanged?.();
    });
  }

  const sizeChanged = Number(sizeCols) !== cols || Number(sizeRows) !== rows;

  return (
    <div>
      {error && <div className="dl-error" role="alert">{error}</div>}
      {notice && <div className="dl-notice" role="status">{notice}</div>}

      <section className="dl-panel">
        <div className="dl-row" style={{ justifyContent: "space-between", marginBottom: "0.9rem" }}>
          <h2 style={{ margin: 0 }}>Room map</h2>
          {desks.length > 0 && (
            <span className="dl-muted">
              {desks.length} desks · {ownedCount} owned · {desks.length - ownedCount} for sale
            </span>
          )}
        </div>

        {loaded && desks.length === 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <p className="dl-muted" style={{ marginTop: 0 }}>
              Start from a layout and adjust it, or tap empty spots on the map to place desks one at a time.
            </p>
            <div className="dl-row">
              {LAYOUTS.map((l) => (
                <button key={l.key} className="dl-btn quiet" onClick={() => applyLayout(l)} disabled={busy}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {moving && selected && (
          <p className="dl-notice">Tap an empty spot to move desk {selected.label} there.</p>
        )}

        <div className="dl-room" style={{ maxWidth: `${cols * 5.5}rem` }}>
          <div className="dl-room-front">Front of room · Frente del salón</div>
          <div className="dl-room-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: rows }).flatMap((_, y) =>
              Array.from({ length: cols }).map((__, x) => {
                const d = byCell.get(`${x},${y}`);
                if (!d) {
                  return (
                    <button
                      key={`${x},${y}`}
                      className={`dl-cell empty${moving ? " target" : ""}`}
                      onClick={() => clickEmpty(x, y)}
                      disabled={busy}
                      aria-label={`${moving ? "Move desk here" : "Add a desk"}: row ${ROW(y)}, spot ${x + 1}`}
                    >
                      {moving ? "" : "+"}
                    </button>
                  );
                }
                return (
                  <button
                    key={d.id}
                    className={`dl-cell dl-desk${d.owner_student_id ? " sold" : ""}`}
                    aria-pressed={d.id === selectedId}
                    onClick={() => selectDesk(d)}
                  >
                    <span className="lbl">{d.label}</span>
                    <span className="sub">{d.owner_student_id ? nameOf(d.owner_student_id) : fmt(d.price)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="dl-legend">
          <span><i />For sale (price)</span>
          <span><i className="sold" />Owned (owner)</span>
          <span>Tap + to add a desk. Tap a desk to edit, move, or remove it.</span>
        </div>

        {selected && (
          <div className="dl-desk-detail">
            <p style={{ margin: "0 0 0.6rem" }}>
              <strong>Desk {selected.label}</strong>{" "}
              {selected.owner_student_id ? (
                <>owned by <strong>{nameOf(selected.owner_student_id)}</strong></>
              ) : (
                <span className="dl-muted">for sale</span>
              )}
            </p>
            <div className="dl-job-add">
              <input
                className="dl-input"
                aria-label="Desk label"
                value={edit.label}
                maxLength={8}
                onChange={(e) => setEdit({ ...edit, label: e.target.value })}
              />
              <input
                className="dl-input"
                type="number"
                min="1"
                step="1"
                aria-label="Desk price"
                title={selected.owner_student_id ? "Price is locked while a student owns this desk" : undefined}
                value={edit.price}
                disabled={!!selected.owner_student_id}
                onChange={(e) => setEdit({ ...edit, price: e.target.value })}
              />
              <button className="dl-btn" onClick={saveDesk} disabled={busy}>Save</button>
            </div>
            {selected.owner_student_id && (
              <p className="dl-note">The price is locked while a student owns this desk.</p>
            )}
            <div className="dl-row" style={{ marginTop: "0.75rem" }}>
              <button className="dl-btn quiet small" onClick={() => setMoving((m) => !m)} disabled={busy}>
                {moving ? "Cancel move" : "Move"}
              </button>
              {selected.owner_student_id ? (
                <button className="dl-btn quiet small" onClick={buyBack} disabled={busy}>
                  Buy back at full price
                </button>
              ) : (
                <button className="dl-btn danger small" onClick={removeDesk} disabled={busy}>
                  Remove desk
                </button>
              )}
              <button className="dl-btn quiet small" onClick={() => { setSelectedId(null); setMoving(false); }}>
                Close
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="dl-panel">
        <h2>Room setup</h2>
        <div className="dl-payday-grid">
          <label className="dl-field">
            <span>New desk price ({currency})</span>
            <input
              className="dl-input"
              type="number"
              min="1"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
        <div className="dl-row">
          <label className="dl-field" style={{ marginBottom: 0 }}>
            <span>Room size</span>
            <span className="dl-row" style={{ fontWeight: 400 }}>
              <input
                className="dl-input"
                style={{ width: "5rem" }}
                type="number"
                min="2"
                max="12"
                aria-label="Desks across"
                value={sizeCols}
                onChange={(e) => setSizeCols(e.target.value)}
              />
              across ×
              <input
                className="dl-input"
                style={{ width: "5rem" }}
                type="number"
                min="1"
                max="10"
                aria-label="Rows deep"
                value={sizeRows}
                onChange={(e) => setSizeRows(e.target.value)}
              />
              rows
              <button className="dl-btn quiet" onClick={applySize} disabled={busy || !sizeChanged}>
                Apply
              </button>
            </span>
          </label>
        </div>
        <p className="dl-note">
          The new desk price applies to desks you add from now on. Change one desk's price by tapping it on the map.
        </p>
      </section>
    </div>
  );
}
