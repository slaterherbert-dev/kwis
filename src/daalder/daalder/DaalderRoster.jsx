import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./daalder.css";

// Teacher screen: pick or create a class, add students by nickname,
// reset passwords, remove students, and print login cards.
// Passwords are never stored in readable form, so a card can only be
// printed right after creating or resetting a login.
export default function DaalderRoster({ go, loginUrl = `${window.location.origin}/#daalder` }) {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [newClassName, setNewClassName] = useState("");
  const [nicknameText, setNicknameText] = useState("");
  const [cards, setCards] = useState([]); // [{nickname, password}]
  const [problems, setProblems] = useState([]); // [{nickname, error}]
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const current = classes.find((c) => c.id === classId);

  async function loadClasses(selectId) {
    const { data, error } = await supabase
      .from("daalder_classes")
      .select("id, name, class_code, currency_name")
      .order("created_at");
    if (error) return setError(error.message);
    setClasses(data);
    if (selectId) setClassId(selectId);
    else if (!classId && data.length) setClassId(data[0].id);
  }

  async function loadStudents(id) {
    if (!id) return setStudents([]);
    const { data, error } = await supabase
      .from("daalder_students")
      .select("id, nickname, balance, user_id")
      .eq("class_id", id)
      .order("nickname");
    if (error) return setError(error.message);
    setStudents(data);
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadStudents(classId);
    setCards([]);
    setProblems([]);
  }, [classId]);

  async function callRoster(body) {
    const { data, error } = await supabase.functions.invoke("daalder-roster", { body });
    if (error) {
      // Pull the readable message out of the function's JSON reply when there is one.
      let msg = error.message;
      try {
        msg = (await error.context.json()).error ?? msg;
      } catch {}
      throw new Error(msg);
    }
    return data;
  }

  async function createClass() {
    if (!newClassName.trim()) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("daalder_create_class", { p_name: newClassName });
    setBusy(false);
    if (error) return setError(error.message);
    setNewClassName("");
    loadClasses(data.id);
  }

  async function addStudents() {
    const nicknames = nicknameText.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean);
    if (!nicknames.length) return;
    setBusy(true);
    setError("");
    try {
      const { results } = await callRoster({ action: "create_students", class_id: classId, nicknames });
      setCards(results.filter((r) => r.password));
      setProblems(results.filter((r) => r.error));
      setNicknameText("");
      loadStudents(classId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(s) {
    if (!confirm(`Make a new password for ${s.nickname}? Their old one will stop working.`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await callRoster({ action: "reset_password", student_id: s.id });
      setCards([r]);
      setProblems([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(s) {
    if (!confirm(`Remove ${s.nickname}? This deletes their login, Munt, and history.`)) return;
    setBusy(true);
    setError("");
    try {
      await callRoster({ action: "remove_student", student_id: s.id });
      loadStudents(classId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dl dl-roster">
      <header className="dl-no-print">
        <div className="dl-wordmark">
          <span className="dl-coin" aria-hidden="true" />
          Daalder roster
        </div>
        <div className="dl-row">
          {go && (
            <button className="dl-btn quiet small" onClick={() => go("teacher-home")}>
              Back to Kwis
            </button>
          )}
          {classes.length > 0 && (
            <select
              className="dl-input"
              style={{ width: "auto" }}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Class"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {current && (
            <span>
              Class code <span className="dl-code-chip">{current.class_code}</span>
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="dl-error dl-no-print" role="alert">
          {error}
        </div>
      )}

      <section className="dl-panel dl-no-print">
        <h2>New class</h2>
        <div className="dl-row">
          <input
            className="dl-input"
            style={{ maxWidth: "20rem" }}
            placeholder="e.g. Economics, Period 3"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createClass()}
          />
          <button className="dl-btn" onClick={createClass} disabled={busy}>
            Create class
          </button>
        </div>
      </section>

      {current && (
        <>
          <section className="dl-panel dl-no-print">
            <h2>Add students</h2>
            <textarea
              className="dl-textarea"
              rows={5}
              placeholder={"One nickname per line\nbatman\nsoccerstar\nmango7"}
              value={nicknameText}
              onChange={(e) => setNicknameText(e.target.value)}
            />
            <p className="dl-note">
              Nicknames only, never real names. 2 to 20 characters, each unique in this class.
            </p>
            <div className="dl-row" style={{ marginTop: "0.75rem" }}>
              <button className="dl-btn" onClick={addStudents} disabled={busy}>
                {busy ? "Creating logins…" : "Create logins"}
              </button>
            </div>
            {problems.length > 0 && (
              <div className="dl-error" style={{ marginTop: "0.75rem" }}>
                {problems.map((p) => (
                  <div key={p.nickname}>
                    {p.nickname}: {p.error}
                  </div>
                ))}
              </div>
            )}
          </section>

          {cards.length > 0 && (
            <section className="dl-panel dl-print-area">
              <div className="dl-row dl-no-print" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>Login cards</h2>
                <div className="dl-row">
                  <button className="dl-btn" onClick={() => window.print()}>
                    Print cards
                  </button>
                  <button className="dl-btn quiet" onClick={() => setCards([])}>
                    Done
                  </button>
                </div>
              </div>
              <p className="dl-note dl-no-print">
                Print or copy these now. Once you click Done, passwords can't be shown again, only reset.
              </p>
              <div className="dl-cards">
                {cards.map((c) => (
                  <div className="dl-card" key={c.student_id ?? c.nickname}>
                    <div className="dl-wordmark">
                      <span className="dl-coin" aria-hidden="true" />
                      Daalder
                    </div>
                    <dl>
                      <dt>Go to</dt>
                      <dd>{loginUrl.replace(/^https?:\/\//, "")}</dd>
                      <dt>Class code</dt>
                      <dd>{current.class_code}</dd>
                      <dt>Nickname</dt>
                      <dd>{c.nickname}</dd>
                      <dt>Password</dt>
                      <dd className="pw">{c.password}</dd>
                    </dl>
                    <div className="foot">Keep this private. Lost it? Ask your teacher for a new one.</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="dl-panel dl-no-print">
            <h2>
              Students <span className="dl-muted">({students.length})</span>
            </h2>
            {students.length === 0 ? (
              <p className="dl-muted">No students yet. Add nicknames above to create their logins.</p>
            ) : (
              <div className="dl-table-wrap">
                <table className="dl-table">
                  <thead>
                    <tr>
                      <th>Nickname</th>
                      <th style={{ textAlign: "right" }}>{current.currency_name}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id}>
                        <td>{s.nickname}</td>
                        <td className="num">{Number(s.balance).toFixed(2)}</td>
                        <td>
                          <div className="dl-row" style={{ justifyContent: "flex-end" }}>
                            <button className="dl-btn quiet small" onClick={() => resetPassword(s)} disabled={busy}>
                              Reset password
                            </button>
                            <button className="dl-btn danger small" onClick={() => removeStudent(s)} disabled={busy}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
