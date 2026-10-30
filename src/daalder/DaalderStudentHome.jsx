import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./daalder.css";

// First version of the student screen: proves the login works and shows
// the student's own balance and recent history. The full "card" design
// replaces this next.
export default function DaalderStudentHome({ onSignOut }) {
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      // RLS only ever returns this student's own row and own transactions.
      const { data, error } = await supabase
        .from("daalder_students")
        .select("id, nickname, balance, daalder_classes(name, currency_name)")
        .single();
      if (error) return setError("Couldn't load your account. Try signing in again.");
      setMe(data);

      const { data: tx } = await supabase
        .from("daalder_transactions")
        .select("id, amount, kind, note, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      setHistory(tx ?? []);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    onSignOut?.();
  }

  const currency = me?.daalder_classes?.currency_name ?? "Munt";

  return (
    <div className="dl dl-login-page">
      <div className="dl-login" style={{ maxWidth: "28rem" }}>
        <div className="dl-row" style={{ justifyContent: "space-between" }}>
          <div className="dl-wordmark">
            <span className="dl-coin" aria-hidden="true" />
            Daalder
          </div>
          <button className="dl-btn quiet small" onClick={signOut}>
            Sign out
          </button>
        </div>

        {error && <div className="dl-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {me && (
          <>
            <p className="dl-sub">
              {me.nickname}, {me.daalder_classes?.name}
            </p>
            <div style={{ fontSize: "2.75rem", fontWeight: 800, color: "var(--dl-delft)", lineHeight: 1 }}>
              {Number(me.balance).toFixed(2)}
            </div>
            <div className="dl-muted" style={{ marginBottom: "1.5rem" }}>{currency} in savings</div>

            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>Recent activity</h2>
            {history.length === 0 ? (
              <p className="dl-muted">Nothing yet. Munt you earn will show up here.</p>
            ) : (
              <table className="dl-table">
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id}>
                      <td>{t.note || t.kind}</td>
                      <td
                        className="num"
                        style={{ color: t.amount < 0 ? "var(--dl-danger)" : "inherit", fontWeight: 700 }}
                      >
                        {t.amount > 0 ? "+" : ""}
                        {Number(t.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
