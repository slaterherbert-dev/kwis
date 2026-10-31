import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import DaalderAward from "./DaalderAward";
import DaalderJobs from "./DaalderJobs";
import DaalderStore from "./DaalderStore";
import DaalderDesks from "./DaalderDesks";
import DaalderStocks from "./DaalderStocks";
import "./daalder.css";

// Teacher area for Daalder: pick a class, then Award (give Munt),
// Jobs (base pay, jobs, payday), Store (items, orders), Desks (room map), Stocks, or Students (add logins, reset passwords, print cards).
// Passwords are never stored in readable form, so a card can only be
// printed right after creating or resetting a login.
export default function DaalderRoster({ go, loginUrl = `${window.location.origin}/#daalder` }) {
  const [classes, setClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [tab, setTab] = useState("award");
  const [creating, setCreating] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [nicknameText, setNicknameText] = useState("");
  const [cards, setCards] = useState([]); // [{nickname, password}]
  const [problems, setProblems] = useState([]); // [{nickname, error}]
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);

  const current = classes.find((c) => c.id === classId);
  const currency = current?.currency_name ?? "Munt";

  async function loadClasses(selectId) {
    const { data, error } = await supabase
      .from("daalder_classes")
      .select("id, name, class_code, currency_name, base_pay, payday_dow, auto_payday, last_paid_week, desk_cols, desk_rows, stocks_enabled")
      .order("created_at");
    setClassesLoaded(true);
    if (error) return setError(error.message);
    setClasses(data);
    if (selectId) setClassId(selectId);
    else if (data.length) setClassId((prev) => prev || data[0].id);
  }

  async function loadStudents(id = classId) {
    if (!id) return setStudents([]);
    const { data, error } = await supabase
      .from("daalder_students")
      .select("id, nickname, balance, user_id")
      .eq("class_id", id)
      .order("nickname");
    if (error) return setError(error.message);
    setStudents(data);
  }

  // Count of store orders waiting to be handed out (shown on the Store tab).
  async function loadPending(id = classId) {
    if (!id) return setPendingOrders(0);
    const { count } = await supabase
      .from("daalder_purchases")
      .select("id", { count: "exact", head: true })
      .eq("class_id", id)
      .eq("status", "pending");
    setPendingOrders(count ?? 0);
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadPending(classId);
  }, [classId, tab]);

  useEffect(() => {
    loadStudents(classId);
    setCards([]);
    setProblems([]);
    setError("");
  }, [classId]);

  async function callRoster(body) {
    const { data, error } = await supabase.functions.invoke("daalder-roster", { body });
    if (error) {
      // Pull the readable message out of the function's reply when there is one.
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
    setCreating(false);
    setTab("students");
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
      loadStudents();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(s) {
    if (!window.confirm(`Make a new password for ${s.nickname}? Their old one will stop working.`)) return;
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
    if (!window.confirm(`Remove ${s.nickname}? This deletes their login, Munt, and history.`)) return;
    setBusy(true);
    setError("");
    try {
      await callRoster({ action: "remove_student", student_id: s.id });
      loadStudents();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const showCreate = creating || (classesLoaded && classes.length === 0);

  return (
    <div className="dl dl-page">
      <div className="dl-teacher">
        <div className="dl-topbar dl-no-print">
          <div className="dl-row" style={{ gap: "1rem" }}>
            <div className="dl-wordmark">
              <span className="dl-coin" aria-hidden="true" />
              Daalder
            </div>
            {classes.length > 0 && (
              <select
                className="dl-input"
                style={{ width: "auto" }}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                aria-label="Class"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {classes.length > 0 && !creating && (
              <button className="dl-btn quiet small" onClick={() => setCreating(true)}>
                + New class
              </button>
            )}
          </div>
          <div className="dl-row">
            {current && (
              <span>
                Class code <span className="dl-code-chip">{current.class_code}</span>
              </span>
            )}
            {go && (
              <button className="dl-btn quiet small" onClick={() => go("teacher-home")}>
                Back to Kwis
              </button>
            )}
          </div>
        </div>

        {error && <div className="dl-error dl-no-print" role="alert">{error}</div>}

        {showCreate && (
          <section className="dl-panel dl-no-print">
            <h2>{classes.length === 0 ? "Create your first class" : "New class"}</h2>
            <div className="dl-row">
              <input
                className="dl-input"
                style={{ maxWidth: "20rem" }}
                placeholder="e.g. Economics, Period 3"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createClass()}
                autoFocus
              />
              <button className="dl-btn" onClick={createClass} disabled={busy}>Create class</button>
              {classes.length > 0 && (
                <button className="dl-btn quiet" onClick={() => setCreating(false)}>Cancel</button>
              )}
            </div>
          </section>
        )}

        {current && (
          <>
            <div className="dl-tabs dl-no-print" role="tablist">
              <button className="dl-tab" role="tab" aria-selected={tab === "award"} onClick={() => setTab("award")}>
                Award
              </button>
              <button className="dl-tab" role="tab" aria-selected={tab === "jobs"} onClick={() => setTab("jobs")}>
                Jobs &amp; payday
              </button>
              <button className="dl-tab" role="tab" aria-selected={tab === "store"} onClick={() => setTab("store")}>
                Store{pendingOrders > 0 && <span className="dl-badge">{pendingOrders}</span>}
              </button>
              <button className="dl-tab" role="tab" aria-selected={tab === "desks"} onClick={() => setTab("desks")}>
                Desks
              </button>
              <button className="dl-tab" role="tab" aria-selected={tab === "stocks"} onClick={() => setTab("stocks")}>
                Stocks
              </button>
              <button className="dl-tab" role="tab" aria-selected={tab === "students"} onClick={() => setTab("students")}>
                Students <span className="dl-muted">({students.length})</span>
              </button>
            </div>

            {tab === "award" && (
              <div className="dl-no-print">
                <DaalderAward
                  students={students}
                  currency={currency}
                  onChanged={() => loadStudents()}
                  onAddStudents={() => setTab("students")}
                />
              </div>
            )}

            {tab === "jobs" && (
              <div className="dl-no-print">
                <DaalderJobs
                  classInfo={current}
                  students={students}
                  currency={currency}
                  onChanged={() => {
                    loadStudents();
                    loadClasses(classId);
                  }}
                />
              </div>
            )}

            {tab === "store" && (
              <div className="dl-no-print">
                <DaalderStore
                  classId={classId}
                  students={students}
                  currency={currency}
                  onChanged={() => {
                    loadStudents();
                    loadPending();
                  }}
                />
              </div>
            )}

            {tab === "desks" && (
              <div className="dl-no-print">
                <DaalderDesks
                  classInfo={current}
                  students={students}
                  currency={currency}
                  onChanged={() => {
                    loadStudents();
                    loadClasses(classId);
                  }}
                />
              </div>
            )}

            {tab === "stocks" && (
              <div className="dl-no-print">
                <DaalderStocks
                  classInfo={current}
                  students={students}
                  currency={currency}
                  onChanged={() => {
                    loadStudents();
                    loadClasses(classId);
                  }}
                />
              </div>
            )}

            {tab === "students" && (
              <>
                <section className="dl-panel dl-no-print">
                  <h2>Add students</h2>
                  <textarea
                    className="dl-textarea"
                    rows={5}
                    placeholder={"One nickname per line, for example:\nbatman\nsoccerstar\nmango7"}
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
                        <div key={p.nickname}>{p.nickname}: {p.error}</div>
                      ))}
                    </div>
                  )}
                </section>

                {cards.length > 0 && (
                  <section className="dl-panel dl-print-area">
                    <div className="dl-row dl-no-print" style={{ justifyContent: "space-between" }}>
                      <h2 style={{ margin: 0 }}>Login cards</h2>
                      <div className="dl-row">
                        <button className="dl-btn" onClick={() => window.print()}>Print cards</button>
                        <button className="dl-btn quiet" onClick={() => setCards([])}>Done</button>
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
                  <h2>Students <span className="dl-muted">({students.length})</span></h2>
                  {students.length === 0 ? (
                    <p className="dl-muted">No students yet. Add nicknames above to create their logins.</p>
                  ) : (
                    <div className="dl-table-wrap">
                      <table className="dl-table">
                        <thead>
                          <tr>
                            <th>Nickname</th>
                            <th className="num">{currency}</th>
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
          </>
        )}
      </div>
    </div>
  );
}
