import { useState } from "react";
import { supabase } from "../supabase";
import "./daalder.css";

// Teacher sign-in shown when someone opens #daalder-roster while signed out.
// It uses the same Kwis teacher account, just dressed as Daalder.
// After a successful sign-in, App.js opens the roster by itself.
export default function DaalderTeacherLogin({ onStudentPage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(
          signErr.status === 429
            ? "Too many sign-in attempts. Wait a minute, then try again."
            : "That email and password don't match."
        );
        return;
      }
      // Student accounts can't open the teacher area. Sign them back out.
      if (data.user?.app_metadata?.daalder_role === "student") {
        await supabase.auth.signOut();
        setError("That's a student login. Students sign in on the student page.");
      }
    } catch {
      setError("Daalder couldn't connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  const onEnter = (e) => {
    if (e.key === "Enter") signIn();
  };

  return (
    <div className="dl dl-login-page">
      <div className="dl-login" onKeyDown={onEnter}>
        <div className="dl-wordmark">
          <span className="dl-coin" aria-hidden="true" />
          Daalder
        </div>
        <p className="dl-sub">Teacher sign-in. Use your Kwis teacher account.</p>

        {error && (
          <div className="dl-error" role="alert">
            {error}
          </div>
        )}

        <label className="dl-field">
          <span>Email</span>
          <input
            className="dl-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            spellCheck={false}
            autoFocus
          />
        </label>

        <label className="dl-field">
          <span>Password</span>
          <input
            className="dl-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <button className="dl-btn wide" onClick={signIn} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {onStudentPage && (
          <p className="dl-note" style={{ textAlign: "center", marginTop: "1rem" }}>
            Student?{" "}
            <button className="dl-btn quiet small" onClick={onStudentPage}>
              Go to student sign-in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
