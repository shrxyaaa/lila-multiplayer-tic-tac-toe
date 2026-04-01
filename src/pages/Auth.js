import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithIdentifier, signUpWithEmail } from "../nakama";
import MiniBoardLogo from "./MiniBoardLogo";
import "./pages.css";

function DecorativeX({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <line x1="7" y1="7" x2="33" y2="33" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="33" y1="7" x2="7" y2="33" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

function DecorativeO({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="5.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5 12 13l8-5.5" />
      <rect x="4" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5 18a7 7 0 0 1 14 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

function EyeIcon({ open = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
      {!open ? <path d="M4 20 20 4" /> : null}
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSignIn = mode === "signin";

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setShowPassword(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    const trimmedIdentifier = identifier.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    setError("");

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (mode === "signin" && !trimmedIdentifier) {
      setError("Email or username is required.");
      return;
    }

    if (mode === "signup") {
      if (!trimmedEmail) {
        setError("Email is required.");
        return;
      }
      if (trimmedUsername.length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (!/^[A-Za-z0-9_]+$/.test(trimmedUsername)) {
        setError("Username can contain only letters, numbers, and underscore.");
        return;
      }
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(trimmedEmail, password, trimmedUsername);
      } else {
        await signInWithIdentifier(trimmedIdentifier, password);
      }
      navigate("/", { replace: true });
    } catch (err) {
      const message = err?.message || "Authentication failed";

      if (mode === "signup" && err?.code === "email_exists") {
        setMode("signin");
        setIdentifier(err.identifier || trimmedEmail);
        setEmail("");
        setUsername("");
        setError("Account already exists. Please sign in with your email or username.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page-shell lobby-page auth-page">
      <div className="lobby-decor" aria-hidden="true">
        <div className="floating-symbol floating-x floating-a">
          <DecorativeX size={56} />
        </div>
        <div className="floating-symbol floating-o floating-b">
          <DecorativeO size={68} />
        </div>
        <div className="floating-symbol floating-o floating-c">
          <DecorativeO size={48} />
        </div>
        <div className="floating-symbol floating-x floating-d">
          <DecorativeX size={50} />
        </div>
        <div className="floating-symbol floating-x floating-e">
          <DecorativeX size={32} />
        </div>
        <div className="floating-symbol floating-o floating-f">
          <DecorativeO size={36} />
        </div>
        <div className="ambient-glow ambient-glow-a" />
        <div className="ambient-glow ambient-glow-b" />
        <div className="ambient-glow ambient-glow-c" />
      </div>

      <div className="lobby-stage auth-stage">
        <section className="menu-home auth-home">
          <MiniBoardLogo className="menu-logo-board auth-logo-board" />
          <h1 className="menu-title auth-title">TIC TAC TOE</h1>

          <section className="card auth-card auth-panel">
            <div className="auth-segmented" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={`auth-segmented-btn ${isSignIn ? "active" : ""}`}
                onClick={() => switchMode("signin")}
                disabled={loading}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-segmented-btn ${!isSignIn ? "active" : ""}`}
                onClick={() => switchMode("signup")}
                disabled={loading}
              >
                Sign Up
              </button>
            </div>

            {error ? <div className="banner error auth-error-banner">{error}</div> : null}

            <form className="auth-form" onSubmit={handleSubmit}>
              {isSignIn ? (
                <div className="auth-field">
                  <label className="auth-label" htmlFor="identifier">
                    Email or username
                  </label>
                  <div className="auth-input-shell">
                    <span className="auth-input-icon">
                      <UserIcon />
                    </span>
                    <input
                      id="identifier"
                      type="text"
                      className="input auth-input"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      placeholder="you@example.com or your_username"
                    />
                  </div>
                </div>
              ) : (
                <div className="auth-field">
                  <label className="auth-label" htmlFor="email">
                    Email
                  </label>
                  <div className="auth-input-shell">
                    <span className="auth-input-icon">
                      <MailIcon />
                    </span>
                    <input
                      id="email"
                      type="email"
                      className="input auth-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              )}

              {!isSignIn ? (
                <div className="auth-field">
                  <label className="auth-label" htmlFor="username">
                    Username
                  </label>
                  <div className="auth-input-shell">
                    <span className="auth-input-icon">
                      <UserIcon />
                    </span>
                    <input
                      id="username"
                      type="text"
                      className="input auth-input"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="pick-a-username"
                    />
                  </div>
                </div>
              ) : null}

              <div className="auth-field">
                <label className="auth-label" htmlFor="password">
                  Password
                </label>
                <div className="auth-input-shell">
                  <span className="auth-input-icon">
                    <LockIcon />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="input auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isSignIn ? "current-password" : "new-password"}
                    placeholder="your password"
                  />
                  <button
                    type="button"
                    className="auth-visibility-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <button type="submit" className="btn primary auth-submit" disabled={loading}>
                <span>
                  {loading
                    ? isSignIn
                      ? "Signing in..."
                      : "Creating account..."
                    : isSignIn
                    ? "Sign In"
                    : "Create account"}
                </span>
                {!loading ? (
                  <span className="auth-submit-icon">
                    <ArrowRightIcon />
                  </span>
                ) : null}
              </button>
            </form>
          </section>

          <p className="auth-switch-copy">
            {isSignIn ? "Don't have an account?" : "Already have an account?"}
            <button
              type="button"
              className="linkish auth-switch-link"
              onClick={() => switchMode(isSignIn ? "signup" : "signin")}
              disabled={loading}
            >
              {isSignIn ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}

export default Auth;
