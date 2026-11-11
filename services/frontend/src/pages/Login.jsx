
import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { login, DEMO_ACCOUNTS, ROLE_LABEL } from "../api/authApi";
import ForgotPassword from "./ForgotPassword";
import Register from "./Register";

function SanchayaMark() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00665D] shadow-sm">
      <svg
        width="23"
        height="23"
        viewBox="0 0 64 64"
        fill="none"
        aria-label="Sanchaya logo"
      >
        <path d="M32 7L55 20L32 33L9 20L32 7Z" fill="#00ED64" />
        <path
          d="M9 29L32 42L55 29M9 40L32 53L55 40"
          stroke="#00ED64"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function AuthenticationTransition({ phase }) {
  const success = phase === "success";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#004F49]/95 px-5">
      <div className="flex flex-col items-center text-center">
        <SanchayaMark />

        {success ? (
          <div className="mt-7 flex h-20 w-20 items-center justify-center rounded-full border border-[#00ED64] bg-[#00ED64]/10 text-[#00ED64]">
            <CheckCircle2 size={46} />
          </div>
        ) : (
          <div className="mt-8 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[#00ED64]" />
        )}

        <h2 className="mt-6 text-2xl font-semibold text-white">
          {success ? "Welcome to Sanchaya" : "Signing you in"}
        </h2>

        <p className="mt-2 text-sm text-white/75">
          {success
            ? "Preparing your workspace..."
            : "Verifying your credentials..."}
        </p>
      </div>
    </div>
  );
}

const inputClass =
  "min-h-[46px] w-full rounded-full border border-[#E2E8E4] bg-white px-4 text-sm text-[#34413A] outline-none transition placeholder:text-[#A8B0AB] focus:border-[#087A6F] focus:ring-4 focus:ring-[#087A6F]/10 disabled:opacity-60";

export default function Login({ onLogin, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const redirectTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email address and password.");
      return;
    }

    setBusy(true);
    setPhase("loading");

    try {
      // Backend identifies the user's role automatically.
      const user = await login(email.trim(), password);

      setPhase("success");

      redirectTimer.current = setTimeout(() => {
        onLogin?.(user);
      }, 1600);
    } catch (err) {
      setError(
        err?.message ||
          "Unable to sign in. Check your details and try again."
      );
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(account) {
    if (busy) return;

    setEmail(account.email);
    setPassword(account.password);
    setError("");
  }

  function openRegister() {
    setError("");

    if (typeof onRegister === "function") {
      onRegister();
    } else {
      setShowRegister(true);
    }
  }

  if (showForgotPassword) {
    return (
      <ForgotPassword
        initialEmail={email}
        onBackToLogin={() => setShowForgotPassword(false)}
      />
    );
  }

  if (showRegister) {
    return <Register onBackToLogin={() => setShowRegister(false)} />;
  }

  return (
    <>
      {phase !== "idle" && <AuthenticationTransition phase={phase} />}

      <main className="sanchaya-login-page">
        <div className="sanchaya-login-frame">
          <section className="sanchaya-login-grid">
            <div className="sanchaya-login-card">
              <div className="mb-4 flex justify-center">
                <SanchayaMark />
              </div>

              <header className="text-center">
                <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#303632] sm:text-[34px]">
                  Welcome back
                </h1>

                <p className="mt-2 text-sm text-[#68746D]">
                  Sign in to continue to your Sanchaya workspace.
                </p>

                <p className="mt-2 text-sm text-[#68746D]">
                  New here?{" "}
                  <button
                    type="button"
                    onClick={openRegister}
                    className="font-semibold text-[#00665D] underline underline-offset-2 hover:text-[#003F3A]"
                  >
                    Create New Account
                  </button>
                </p>
              </header>

              <form onSubmit={handleSubmit} noValidate className="mt-7">
                {/* Email */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-2 block text-sm font-semibold text-[#3D4641]"
                  >
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]"
                    />

                    <input
                      id="login-email"
                      type="email"
                      autoComplete="username"
                      placeholder="e.g. you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      required
                      className={`${inputClass} pl-11`}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="mt-5">
                  <label
                    htmlFor="login-password"
                    className="mb-2 block text-sm font-semibold text-[#3D4641]"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <LockKeyhole
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]"
                    />

                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      required
                      className={`${inputClass} pl-11 pr-12`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((value) => !value)
                      }
                      disabled={busy}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#8D9992] transition hover:bg-[#EFF7F3] hover:text-[#00665D]"
                    >
                      <span
                        key={String(showPassword)}
                        className="password-toggle-animation inline-flex"
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </span>
                    </button>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setShowForgotPassword(true);
                      }}
                      disabled={busy}
                      className="text-sm font-semibold text-[#00665D] underline underline-offset-2 hover:text-[#003F3A] disabled:opacity-50"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !email.trim() || !password}
                  className="mt-7 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#00665D] px-5 py-3.5 text-sm font-semibold text-white transition duration-200 hover:bg-[#00564F] hover:shadow-lg hover:shadow-[#00665D]/15 active:scale-[.99] disabled:cursor-not-allowed disabled:bg-[#A8BDB7]"
                >
                  {busy ? "Signing in..." : "Login"}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs text-[#929D96]">
                <span className="h-px flex-1 bg-[#E8ECE9]" />
                <span>Or login with</span>
                <span className="h-px flex-1 bg-[#E8ECE9]" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled
                  title="Google sign-in will be available after backend authentication is connected"
                  className="flex h-10 items-center justify-center rounded-full border border-[#E5EAE7] bg-white text-lg font-bold text-[#4285F4] opacity-70"
                  aria-label="Google sign-in coming soon"
                >
                  G
                </button>

                <button
                  type="button"
                  disabled
                  title="X sign-in coming soon"
                  className="flex h-10 items-center justify-center rounded-full border border-[#E5EAE7] bg-white text-base font-semibold text-[#202520] opacity-70"
                  aria-label="X sign-in coming soon"
                >
                  𝕏
                </button>

                <button
                  type="button"
                  disabled
                  title="Facebook sign-in coming soon"
                  className="flex h-10 items-center justify-center rounded-full border border-[#E5EAE7] bg-white text-lg font-bold text-[#1877F2] opacity-70"
                  aria-label="Facebook sign-in coming soon"
                >
                  f
                </button>
              </div>

              {/* Demo Accounts - Preserved */}
              <div className="mt-6 rounded-xl border border-[#E8EFEB] bg-[#FBFDFC] p-3.5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#52645A]">
                  <Sparkles size={15} className="text-[#087A6F]" />
                  Demo accounts
                </div>

                <p className="mb-3 text-xs leading-5 text-[#758078]">
                  Select a demo account to automatically fill in its email
                  and password.
                </p>

                <div className="flex flex-wrap justify-center gap-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      disabled={busy}
                      className="rounded-full border border-[#DCE7E1] bg-white px-3 py-2 text-xs font-semibold text-[#426257] transition hover:border-[#087A6F] hover:bg-[#EFF8F3] disabled:opacity-50"
                    >
                      {ROLE_LABEL[account.role]}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[#9AA49E]">
                <ShieldCheck size={14} />
                Protected project knowledge workspace
              </p>
            </div>
          </section>
        </div>
      </main>

      <style>{`
        .sanchaya-login-page {
          box-sizing: border-box;
          width: 100%;
          min-height: calc(100vh - 4rem);
          padding: 28px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f7f8f7;
        }

        .sanchaya-login-frame {
          box-sizing: border-box;
          width: min(100%, 1000px);
          padding: 24px;
          background: #005e55;
          box-shadow: 0 18px 55px rgba(0, 49, 44, .10);
        }

        .sanchaya-login-grid {
          box-sizing: border-box;
          width: 100%;
          min-height: 0;
          padding: 44px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #fff;
          background-image:
            linear-gradient(to right, transparent calc(20% - .5px), #edf0ee 20%, transparent calc(20% + .5px)),
            linear-gradient(to right, transparent calc(80% - .5px), #edf0ee 80%, transparent calc(80% + .5px)),
            linear-gradient(to bottom, transparent calc(14% - .5px), #edf0ee 14%, transparent calc(14% + .5px)),
            linear-gradient(to bottom, transparent calc(86% - .5px), #edf0ee 86%, transparent calc(86% + .5px));
        }

        .sanchaya-login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 410px;
          animation: sanchayaLoginEnter .45s ease-out both;
        }

        @keyframes sanchayaLoginEnter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 640px) {
          .sanchaya-login-page {
            min-height: calc(100vh - 4rem);
            padding: 16px 12px;
          }

          .sanchaya-login-frame { padding: 10px; }
          .sanchaya-login-grid { padding: 30px 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sanchaya-login-card { animation: none !important; }
        }
      `}</style>
    </>
  );
}
