import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

// One click fills an empty store. Edit names, prices, and stock freely.
const STARTER_ITEMS = [
  { name: "Music during work time / Música durante el trabajo", price: 10, quantity: null },
  { name: "First in line / Primero en la fila", price: 10, quantity: null },
  { name: "Pick your seat for a day / Escoge tu asiento por un día", price: 15, quantity: null },
  { name: "Choose the warm-up question / Escoge la pregunta del día", price: 20, quantity: null },
  { name: "Teacher's chair for a class / Silla del maestro por una clase", price: 40, quantity: 1 },
  { name: "Homework pass / Pase de tarea", price: 60, quantity: null },
];

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Blank means unlimited; otherwise a whole number 0 or more.
function parseQty(text) {
  if (String(text ?? "").trim() === "") return { ok: true, value: null };
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? { ok: true, value: n } : { ok: false };
}

export default function DaalderStore({ classId, students, currency, onChanged }) {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newQty, setNewQty] = useState("");
  const [editing, setEditing] = useState(null); // { id, name, price, quantity }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [itemRes, orderRes] = await Promise.all([
      supabase
        .from("daalder_store_items")
        .select("id, name, price, quantity, active")
        .eq("class_id", classId)
        .order("price")
        .order("name"),
      supabase
        .from("daalder_purchases")
        .select("id, student_id, item_name, price_paid, status, created_at, handled_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setLoaded(true);
    if (itemRes.error || orderRes.error) return setError((itemRes.error || orderRes.error).message);
    setItems(itemRes.data);
    setOrders(orderRes.data);
  }, [classId]);

  useEffect(() => {
    setEditing(null);
    setError("");
    setNotice("");
    load();
  }, [load]);

  // Students' purchases happen on their own devices, so refresh when the teacher comes back to this tab.
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
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id) => students.find((s) => s.id === id)?.nickname ?? "Removed student";
  const pending = orders.filter((o) => o.status === "pending").reverse(); // oldest first
  const handled = orders.filter((o) => o.status !== "pending").slice(0, 8);

  // ---------- Orders ----------
  function handOut(order) {
    run(async () => {
      const { error } = await supabase.rpc("daalder_fulfill_purchase", { p_purchase: order.id });
      if (error) throw error;
      await load();
      onChanged?.();
    });
  }

  function refund(order) {
    const who = nameOf(order.student_id);
    if (!window.confirm(`Refund ${fmt(order.price_paid)} ${currency} to ${who} for "${order.item_name}"?`)) return;
    run(async () => {
      const { error } = await supabase.rpc("daalder_refund_purchase", { p_purchase: order.id });
      if (error) throw error;
      setNotice(`Refunded ${fmt(order.price_paid)} ${currency} to ${who}.`);
      await load();
      onChanged?.();
    });
  }

  // ---------- Items ----------
  function addItem() {
    const name = newName.trim();
    const price = Number(newPrice);
    const qty = parseQty(newQty);
    if (!name) return setError("Give the item a name.");
    if (!(price > 0)) return setError("Enter a price greater than zero.");
    if (!qty.ok) return setError("Stock must be a whole number, or blank for unlimited.");
    run(async () => {
      const { error } = await supabase
        .from("daalder_store_items")
        .insert({ class_id: classId, name, price, quantity: qty.value });
      if (error) throw error;
      setNewName("");
      setNewPrice("");
      setNewQty("");
      await load();
    });
  }

  function addStarterItems() {
    run(async () => {
      const { error } = await supabase
        .from("daalder_store_items")
        .insert(STARTER_ITEMS.map((i) => ({ ...i, class_id: classId })));
      if (error) throw error;
      await load();
    });
  }

  function saveEdit() {
    const name = editing.name.trim();
    const price = Number(editing.price);
    const qty = parseQty(editing.quantity);
    if (!name) return setError("Give the item a name.");
    if (!(price > 0)) return setError("Enter a price greater than zero.");
    if (!qty.ok) return setError("Stock must be a whole number, or blank for unlimited.");
    run(async () => {
      const { error } = await supabase
        .from("daalder_store_items")
        .update({ name, price, quantity: qty.value })
        .eq("id", editing.id);
      if (error) throw error;
      setEditing(null);
      await load();
    });
  }

  function toggleActive(item) {
    run(async () => {
      const { error } = await supabase
        .from("daalder_store_items")
        .update({ active: !item.active })
        .eq("id", item.id);
      if (error) throw error;
      await load();
    });
  }

  function removeItem(item) {
    if (!window.confirm(`Delete "${item.name}" from the store?`)) return;
    run(async () => {
      const { error } = await supabase.from("daalder_store_items").delete().eq("id", item.id);
      if (error) {
        // 23503: someone has bought it, and the database keeps purchase history.
        if (error.code === "23503") throw new Error("Students have bought this item, so it can't be deleted. Hide it instead.");
        throw error;
      }
      await load();
    });
  }

  return (
    <div>
      {error && <div className="dl-error" role="alert">{error}</div>}
      {notice && <div className="dl-notice" role="status">{notice}</div>}

      <section className="dl-panel">
        <h2>
          To hand out{pending.length > 0 && <span className="dl-badge">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="dl-muted" style={{ margin: 0 }}>
            Nothing waiting. When a student buys something, it shows up here until you hand it out.
          </p>
        ) : (
          <ul className="dl-orders">
            {pending.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>{nameOf(o.student_id)}</strong> bought {o.item_name}
                  <span className="dl-order-meta">
                    {fmt(o.price_paid)} {currency} · {when(o.created_at)}
                  </span>
                </div>
                <div className="dl-row">
                  <button className="dl-btn small" onClick={() => handOut(o)} disabled={busy}>Done</button>
                  <button className="dl-btn quiet small" onClick={() => refund(o)} disabled={busy}>Refund</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {handled.length > 0 && (
          <details className="dl-recent">
            <summary>Recently handled</summary>
            <ul className="dl-orders">
              {handled.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{nameOf(o.student_id)}</strong> · {o.item_name}
                    <span className="dl-order-meta">
                      {o.status === "refunded" ? "Refunded" : "Handed out"} · {when(o.handled_at ?? o.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="dl-panel">
        <h2>Store items</h2>

        {loaded && items.length === 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <p className="dl-muted" style={{ marginTop: 0 }}>
              The store is empty. Start with a set of common rewards, or add your own below.
            </p>
            <button className="dl-btn quiet" onClick={addStarterItems} disabled={busy}>
              Add starter items
            </button>
          </div>
        )}

        {items.length > 0 && (
          <ul className="dl-jobs">
            {items.map((item) => (
              <li key={item.id} className={`dl-job${item.active ? "" : " dl-hidden-item"}`}>
                {editing?.id === item.id ? (
                  <div className="dl-job-add">
                    <input
                      className="dl-input title"
                      aria-label="Item name"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      autoFocus
                    />
                    <input
                      className="dl-input"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="Price"
                      value={editing.price}
                      onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                    />
                    <input
                      className="dl-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Unlimited"
                      aria-label="Stock (blank for unlimited)"
                      value={editing.quantity}
                      onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                    />
                    <button className="dl-btn" onClick={saveEdit} disabled={busy}>Save</button>
                    <button className="dl-btn quiet" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="dl-job-head">
                    <div>
                      <strong>{item.name}</strong>
                      <span className="dl-job-pay">{fmt(item.price)} {currency}</span>
                      <span className="dl-order-meta">
                        {item.quantity == null
                          ? "Unlimited"
                          : item.quantity === 0
                          ? "Sold out"
                          : `${item.quantity} left`}
                        {!item.active && " · Hidden from students"}
                      </span>
                    </div>
                    <div className="dl-row">
                      <button
                        className="dl-btn quiet small"
                        onClick={() =>
                          setEditing({
                            id: item.id,
                            name: item.name,
                            price: String(item.price),
                            quantity: item.quantity == null ? "" : String(item.quantity),
                          })
                        }
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button className="dl-btn quiet small" onClick={() => toggleActive(item)} disabled={busy}>
                        {item.active ? "Hide" : "Show"}
                      </button>
                      <button className="dl-btn danger small" onClick={() => removeItem(item)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <h3 className="dl-subhead">Add an item</h3>
        <div className="dl-job-add">
          <input
            className="dl-input title"
            placeholder="Item, e.g. Sticker / Calcomanía"
            aria-label="New item name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <input
            className="dl-input"
            type="number"
            min="1"
            step="1"
            placeholder="Price"
            aria-label="Price"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <input
            className="dl-input"
            type="number"
            min="0"
            step="1"
            placeholder="Stock"
            aria-label="Stock (blank for unlimited)"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <button className="dl-btn" onClick={addItem} disabled={busy}>Add item</button>
        </div>
        <p className="dl-note">Leave Stock blank for unlimited. Hidden items stay in history but disappear from the student shop.</p>
      </section>
    </div>
  );
}
