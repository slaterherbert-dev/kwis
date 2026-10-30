import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

// One click fills an empty class with common jobs. Edit titles and pay freely.
const STARTER_JOBS = [
  { title: "Banker / Banquero", salary: 15 },
  { title: "Attendance Clerk / Asistencia", salary: 10 },
  { title: "Tech Helper / Ayudante de tecnología", salary: 10 },
  { title: "Supply Manager / Materiales", salary: 10 },
  { title: "Translator / Traductor", salary: 10 },
  { title: "Messenger / Mensajero", salary: 5 },
];

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Monday of this week as YYYY-MM-DD, matching how the database records paydays.
function thisMonday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const weekOf = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function DaalderJobs({ classInfo, students, currency, onChanged }) {
  const classId = classInfo.id;
  const [jobs, setJobs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [basePay, setBasePay] = useState("0");
  const [payday, setPayday] = useState(5);
  const [auto, setAuto] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [editing, setEditing] = useState(null); // { id, title, salary }
  const [assigning, setAssigning] = useState(null); // job id
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Show the saved settings whenever the class (or its saved settings) change.
  useEffect(() => {
    setBasePay(String(classInfo.base_pay ?? 0));
    setPayday(classInfo.payday_dow ?? 5);
    setAuto(!!classInfo.auto_payday);
  }, [classInfo.id, classInfo.base_pay, classInfo.payday_dow, classInfo.auto_payday]);

  const loadJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("daalder_jobs")
      .select("id, title, salary, active, daalder_job_assignments(student_id)")
      .eq("class_id", classId)
      .order("created_at")
      .order("title");
    setLoaded(true);
    if (error) return setError(error.message);
    setJobs(data);
  }, [classId]);

  useEffect(() => {
    setAssigning(null);
    setEditing(null);
    setNotice("");
    setError("");
    loadJobs();
  }, [loadJobs]);

  // Runs one change, showing errors in the panel instead of crashing.
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

  // ---------- Payday ----------
  const savedBase = Number(classInfo.base_pay ?? 0);
  const dirty =
    Number(basePay) !== savedBase ||
    Number(payday) !== (classInfo.payday_dow ?? 5) ||
    auto !== !!classInfo.auto_payday;
  const dayName = DAYS.find((d) => d.value === Number(payday))?.label ?? "Friday";

  const inClass = new Set(students.map((s) => s.id));
  const nameOf = (id) => students.find((s) => s.id === id)?.nickname;
  const holdersOf = (job) => job.daalder_job_assignments.map((a) => a.student_id).filter((id) => inClass.has(id));

  const jobPayTotal = jobs
    .filter((j) => j.active)
    .reduce((sum, j) => sum + Number(j.salary) * holdersOf(j).length, 0);
  const payTotal = savedBase * students.length + jobPayTotal;
  const paidStudents = savedBase > 0
    ? students.length
    : new Set(jobs.filter((j) => j.active && Number(j.salary) > 0).flatMap(holdersOf)).size;
  const paidThisWeek = classInfo.last_paid_week === thisMonday();

  function savePayday() {
    const value = Number(basePay);
    if (basePay === "" || !(value >= 0)) return setError("Base pay can't be blank or negative.");
    run(async () => {
      const { error } = await supabase.rpc("daalder_set_payday", {
        p_class: classId,
        p_base_pay: value,
        p_payday_dow: Number(payday),
        p_auto: auto,
      });
      if (error) throw error;
      setNotice(
        auto
          ? `Saved. Paychecks will deposit automatically every ${dayName} morning.`
          : "Saved. Automatic payday is off, so use Pay now when you're ready."
      );
      onChanged?.();
    });
  }

  function payNow() {
    if (dirty) return setError("Save your payday settings first.");
    if (payTotal <= 0) return setError("Nothing to pay yet. Set a base pay or assign students to jobs.");
    const total = `${fmt(payTotal)} ${currency} to ${paidStudents} student${paidStudents === 1 ? "" : "s"}`;
    const ok = window.confirm(
      paidThisWeek
        ? `This class was already paid this week. Pay everyone again (${total})?`
        : `Run payday now? That's ${total}.`
    );
    if (!ok) return;
    run(async () => {
      const { data, error } = await supabase.rpc("daalder_run_payroll", {
        p_class: classId,
        p_again: paidThisWeek,
      });
      if (error) throw error;
      setNotice(`Payday done: ${data} paycheck${data === 1 ? "" : "s"} deposited.`);
      onChanged?.();
    });
  }

  // ---------- Jobs ----------
  function addJob() {
    const title = newTitle.trim();
    const salary = Number(newSalary);
    if (!title) return setError("Give the job a title.");
    if (newSalary === "" || !(salary >= 0)) return setError("Enter the job's pay per payday.");
    run(async () => {
      const { error } = await supabase.from("daalder_jobs").insert({ class_id: classId, title, salary });
      if (error) throw error;
      setNewTitle("");
      setNewSalary("");
      await loadJobs();
    });
  }

  function addStarterJobs() {
    run(async () => {
      const { error } = await supabase
        .from("daalder_jobs")
        .insert(STARTER_JOBS.map((j) => ({ ...j, class_id: classId })));
      if (error) throw error;
      await loadJobs();
    });
  }

  function saveEdit() {
    const title = editing.title.trim();
    const salary = Number(editing.salary);
    if (!title) return setError("Give the job a title.");
    if (editing.salary === "" || !(salary >= 0)) return setError("Enter the job's pay per payday.");
    run(async () => {
      const { error } = await supabase.from("daalder_jobs").update({ title, salary }).eq("id", editing.id);
      if (error) throw error;
      setEditing(null);
      await loadJobs();
    });
  }

  function removeJob(job) {
    if (!window.confirm(`Remove the job "${job.title}"? Past paychecks stay in students' history.`)) return;
    run(async () => {
      const { error } = await supabase.from("daalder_jobs").delete().eq("id", job.id);
      if (error) throw error;
      if (assigning === job.id) setAssigning(null);
      await loadJobs();
    });
  }

  function startAssign(job) {
    setEditing(null);
    setPicked(new Set(holdersOf(job)));
    setAssigning(job.id);
  }

  const togglePick = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  function saveAssignments(job) {
    const before = new Set(holdersOf(job));
    const add = [...picked].filter((id) => !before.has(id));
    const remove = [...before].filter((id) => !picked.has(id));
    run(async () => {
      if (remove.length) {
        const { error } = await supabase
          .from("daalder_job_assignments")
          .delete()
          .eq("job_id", job.id)
          .in("student_id", remove);
        if (error) throw error;
      }
      if (add.length) {
        const { error } = await supabase
          .from("daalder_job_assignments")
          .insert(add.map((student_id) => ({ job_id: job.id, student_id })));
        if (error) throw error;
      }
      setAssigning(null);
      await loadJobs();
    });
  }

  // Which other jobs each student already holds (shown while assigning).
  const otherJobs = (studentId, jobId) =>
    jobs
      .filter((j) => j.id !== jobId && holdersOf(j).includes(studentId))
      .map((j) => j.title.split(" / ")[0]);

  return (
    <div>
      {error && <div className="dl-error" role="alert">{error}</div>}
      {notice && <div className="dl-notice" role="status">{notice}</div>}

      <section className="dl-panel dl-payrun">
        <div>
          <h2>This week</h2>
          <p>
            {paidThisWeek
              ? "Paid this week."
              : classInfo.last_paid_week
              ? `Not paid yet. Last payday was the week of ${weekOf(classInfo.last_paid_week)}.`
              : "No paydays yet."}
          </p>
          <p className="dl-muted">
            A payday sends {fmt(payTotal)} {currency} to {paidStudents} student{paidStudents === 1 ? "" : "s"}.
          </p>
        </div>
        <button className="dl-btn" onClick={payNow} disabled={busy}>Pay now</button>
      </section>

      <section className="dl-panel">
        <h2>Payday settings</h2>
        <p className="dl-note" style={{ marginTop: 0, marginBottom: "1rem" }}>
          Every student gets base pay each payday. Students with a job also get that job's pay.
        </p>
        <div className="dl-payday-grid">
          <label className="dl-field">
            <span>Base pay ({currency})</span>
            <input
              className="dl-input"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={basePay}
              onChange={(e) => setBasePay(e.target.value)}
            />
          </label>
          <label className="dl-field">
            <span>Payday</span>
            <select className="dl-input" value={payday} onChange={(e) => setPayday(Number(e.target.value))}>
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="dl-check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Deposit paychecks automatically every {dayName} morning</span>
        </label>
        <p className="dl-note">Turn this off over breaks so nobody gets paid for weeks without school.</p>
        <div className="dl-row" style={{ marginTop: "0.9rem" }}>
          <button className="dl-btn" onClick={savePayday} disabled={busy || !dirty}>
            Save payday settings
          </button>
        </div>
      </section>

      <section className="dl-panel">
        <h2>Jobs</h2>

        {loaded && jobs.length === 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <p className="dl-muted" style={{ marginTop: 0 }}>
              No jobs yet. Start with a set of common classroom jobs, or add your own below.
            </p>
            <button className="dl-btn quiet" onClick={addStarterJobs} disabled={busy}>
              Add starter jobs
            </button>
          </div>
        )}

        {jobs.length > 0 && (
          <ul className="dl-jobs">
            {jobs.map((job) => {
              const holders = holdersOf(job);
              return (
                <li key={job.id} className="dl-job">
                  {editing?.id === job.id ? (
                    <div className="dl-job-add">
                      <input
                        className="dl-input title"
                        aria-label="Job title"
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                        autoFocus
                      />
                      <input
                        className="dl-input"
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Pay per payday"
                        value={editing.salary}
                        onChange={(e) => setEditing({ ...editing, salary: e.target.value })}
                      />
                      <button className="dl-btn" onClick={saveEdit} disabled={busy}>Save</button>
                      <button className="dl-btn quiet" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="dl-job-head">
                      <div>
                        <strong>{job.title}</strong>
                        <span className="dl-job-pay">
                          {fmt(job.salary)} {currency} per payday
                        </span>
                      </div>
                      <div className="dl-row">
                        <button className="dl-btn quiet small" onClick={() => startAssign(job)} disabled={busy}>
                          Assign students
                        </button>
                        <button
                          className="dl-btn quiet small"
                          onClick={() => {
                            setAssigning(null);
                            setEditing({ id: job.id, title: job.title, salary: String(job.salary) });
                          }}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button className="dl-btn danger small" onClick={() => removeJob(job)} disabled={busy}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {assigning === job.id ? (
                    <div className="dl-assign">
                      {students.length === 0 ? (
                        <p className="dl-muted">Add students on the Students tab first.</p>
                      ) : (
                        <>
                          <p className="dl-note" style={{ marginBottom: "0.6rem" }}>
                            Tap students to give or take away this job.
                          </p>
                          <div className="dl-tiles">
                            {students.map((s) => {
                              const others = otherJobs(s.id, job.id);
                              return (
                                <button
                                  key={s.id}
                                  className="dl-tile"
                                  aria-pressed={picked.has(s.id)}
                                  onClick={() => togglePick(s.id)}
                                >
                                  <span className="nick">{s.nickname}</span>
                                  <span className="bal">{others.length ? others.join(", ") : "No job"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      <div className="dl-row" style={{ marginTop: "0.75rem" }}>
                        <button className="dl-btn" onClick={() => saveAssignments(job)} disabled={busy}>
                          Save
                        </button>
                        <button className="dl-btn quiet" onClick={() => setAssigning(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="dl-holders">
                      {holders.length ? (
                        holders.map((id) => <span key={id} className="dl-holder">{nameOf(id)}</span>)
                      ) : (
                        <span className="dl-muted">Nobody has this job yet.</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="dl-subhead">Add a job</h3>
        <div className="dl-job-add">
          <input
            className="dl-input title"
            placeholder="Job title, e.g. Librarian / Bibliotecario"
            aria-label="New job title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addJob()}
          />
          <input
            className="dl-input"
            type="number"
            min="0"
            step="1"
            placeholder="Pay"
            aria-label="Pay per payday"
            value={newSalary}
            onChange={(e) => setNewSalary(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addJob()}
          />
          <button className="dl-btn" onClick={addJob} disabled={busy}>Add job</button>
        </div>
      </section>
    </div>
  );
}
