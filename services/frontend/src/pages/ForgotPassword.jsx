import { useEffect, useRef, useState } from "react";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

function SanchayaMark() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00665D] shadow-sm">
      <svg width="23" height="23" viewBox="0 0 64 64" fill="none" aria-label="Sanchaya logo">
        <path d="M32 7L55 20L32 33L9 20L32 7Z" fill="#00ED64" />
        <path d="M9 29L32 42L55 29M9 40L32 53L55 40" stroke="#00ED64" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const inputClass =
  "min-h-[46px] w-full rounded-full border border-[#E2E8E4] bg-white px-4 text-sm text-[#34413A] outline-none transition placeholder:text-[#A8B0AB] focus:border-[#087A6F] focus:ring-4 focus:ring-[#087A6F]/10 disabled:opacity-60";

export default function ForgotPassword({ initialEmail = "", onBackToLogin }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    timer.current = setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1400);
  }

  return (
    <main className="sanchaya-forgot-page">
      <div className="sanchaya-forgot-frame">
        <section className="sanchaya-forgot-grid">
          <div className="sanchaya-forgot-card">
            {sent ? (
              <div className="py-5 text-center forgot-content-enter">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#087A6F] bg-[#EAF7F1] text-[#087A6F] forgot-success-pop">
                  <CheckCircle2 size={43} />
                </div>
                <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-[#087A6F]">
                  ACCOUNT RECOVERY
                </p>
                <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#303632]">
                  Reset link requested
                </h1>
                <p className="mt-3 text-sm leading-6 text-[#68746D]">
                  Your demo password-reset request for
                  <strong className="break-all text-[#303632]"> {email.trim()}</strong>
                  {" "}has been completed.
                </p>
                <div className="mt-5 rounded-xl border border-[#E3ECE6] bg-[#F7FBF8] p-4 text-left text-sm leading-6 text-[#68746D]">
                  <p className="font-semibold text-[#40534A]">Please note</p>
                  Demo mode: no email was actually sent and your password has not changed. A backend email service and reset-token flow are required for a real password reset.
                </div>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#00665D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#00564F]"
                >
                  <ArrowLeft size={16} />
                  Return to Login
                </button>
              </div>
            ) : (
              <div className="forgot-content-enter">
                <div className="mb-4 flex justify-center">
                  <SanchayaMark />
                </div>

                <header className="text-center">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#087A6F]">
                    ACCOUNT RECOVERY
                  </p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#303632] sm:text-[34px]">
                    Forgot password?
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-[#68746D]">
                    Enter the email address linked to your Sanchaya account. We’ll guide you through the reset process.
                  </p>
                </header>

                <form onSubmit={handleSubmit} noValidate className="mt-7">
                  <label htmlFor="forgot-email" className="mb-2 block text-sm font-semibold text-[#3D4641]">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      placeholder="e.g. you@company.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={loading}
                      className={`${inputClass} pl-11`}
                    />
                  </div>

                  {error && (
                    <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#00665D] px-5 py-3.5 text-sm font-semibold text-white transition duration-200 hover:bg-[#00564F] hover:shadow-lg hover:shadow-[#00665D]/15 active:scale-[.99] disabled:cursor-wait disabled:opacity-65"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Sending reset request...
                      </>
                    ) : (
                      <>
                        Send Reset Link
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={onBackToLogin}
                  disabled={loading}
                  className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#00665D] underline underline-offset-2 transition hover:text-[#003F3A] disabled:opacity-50"
                >
                  <ArrowLeft size={15} />
                  Back to Login
                </button>

                <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#9AA49E]">
                  <ShieldCheck size={14} />
                  Secure Sanchaya account recovery
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <style>{`
        .sanchaya-forgot-page {
          box-sizing: border-box;
          width: 100%;
          min-height: calc(100vh - 4rem);
          padding: 28px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f7f8f7;
        }
        .sanchaya-forgot-frame {
          box-sizing: border-box;
          width: min(100%, 1000px);
          padding: 24px;
          background: #005e55;
          box-shadow: 0 18px 55px rgba(0, 49, 44, .10);
        }
        .sanchaya-forgot-grid {
          box-sizing: border-box;
          width: 100%;
          padding: 42px 20px;
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
        .sanchaya-forgot-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 410px;
        }
        .forgot-content-enter { animation: forgotContentEnter .45s ease-out both; }
        .forgot-success-pop { animation: forgotSuccessPop .5s cubic-bezier(.17,.67,.35,1.3) both; }
        @keyframes forgotContentEnter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes forgotSuccessPop {
          0% { opacity: 0; transform: scale(.6); }
          75% { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 640px) {
          .sanchaya-forgot-page { min-height: calc(100vh - 4rem); padding: 16px 12px; }
          .sanchaya-forgot-frame { padding: 10px; }
          .sanchaya-forgot-grid { padding: 30px 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .forgot-content-enter, .forgot-success-pop { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
