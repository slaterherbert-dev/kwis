import { useState } from "react";
import { supabase } from "../supabase"; // adjust to your Kwis client path
import "./daalder.css";

// Student sign-in: class code + nickname + password.
// The app looks up the hidden account email, then Supabase checks the password.
export default function DaalderStudentLogin({ onSignedIn }) {
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setError("");
    if (!code.trim() || !nickname.trim() || !password.trim()) {
      setError("Fill in your class code, nickname, and password.");
      return;
    }
    setBusy(true);
    try {
      const { data: email, error: lookupErr } = await supabase.rpc("daalder_login_email", {
        p_class_code: code,
        p_nickname: nickname,
      });
      if (lookupErr) throw lookupErr;
      if (!email) {
        setError("That class code and nickname don't match. Check both with your teacher.");
        return;
      }

      // Generated passwords are lowercase, so forgive a capital first letter.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: password.trim().toLowerCase(),
      });
      if (signErr) {
        setError(
          signErr.status === 429
            ? "Too many sign-ins at once. Wait a minute, then try again."
            : "Wrong password. If you lost your card, your teacher can reset it."
        );
        return;
      }
      onSignedIn?.();
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
        <p className="dl-sub">Sign in to see your Munt.</p>

        {error && (
          <div className="dl-error" role="alert">
            {error}
          </div>
        )}

        <label className="dl-field">
          <span>
            Class code <small>· Código de clase</small>
          </span>
          <input
            className="dl-input code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>

        <label className="dl-field">
          <span>
            Nickname <small>· Apodo</small>
          </span>
          <input
            className="dl-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoComplete="username"
            spellCheck={false}
          />
        </label>

        <label className="dl-field">
          <span>
            Password <small>· Contraseña</small>
          </span>
          <input
            className="dl-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="word-word-00"
          />
        </label>

        <button className="dl-btn wide" onClick={signIn} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
