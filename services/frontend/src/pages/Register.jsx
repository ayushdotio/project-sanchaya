import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  UserRound,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

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
  "min-h-[46px] w-full rounded-full border border-[#E2E8E4] bg-white px-4 text-sm text-[#34413A] outline-none transition placeholder:text-[#A8B0AB] focus:border-[#087A6F] focus:ring-4 focus:ring-[#087A6F]/10";

export default function Register({ onBackToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please complete all fields before continuing.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match. Please check and try again.");
      return;
    }

    setSuccess(true);
    timer.current = setTimeout(() => {
      onBackToLogin?.();
    }, 2200);
  }

  return (
    <main className="sanchaya-register-page">
      <div className="sanchaya-register-frame">
        <section className="sanchaya-register-grid">
          <div className="sanchaya-register-card">
            {success ? (
              <div className="py-7 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#087A6F] bg-[#EAF7F1] text-[#087A6F] register-success-pop">
                  <CheckCircle2 size={43} />
                </div>
                <h1 className="mt-6 font-serif text-3xl font-semibold text-[#303632]">
                  Registration complete
                </h1>
                <p className="mt-3 text-sm leading-6 text-[#68746D]">
                  Your details passed the demo validation. Returning you to the login page.
                </p>
                <p className="mt-4 text-xs leading-5 text-[#929D96]">
                  Demo only: no account has been created or stored. Sign in using one of the available demo accounts.
                </p>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="mt-6 rounded-full bg-[#00665D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#00564F]"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex justify-center">
                  <SanchayaMark />
                </div>

                <header className="text-center">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#087A6F]">
                    SANCHAYA WORKSPACE
                  </p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#303632] sm:text-[34px]">
                    Create your account
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-[#68746D]">
                    Set up your profile to explore project knowledge continuity.
                  </p>
                </header>

                <form onSubmit={handleSubmit} noValidate className="mt-7">
                  <div>
                    <label htmlFor="register-name" className="mb-2 block text-sm font-semibold text-[#3D4641]">
                      Full name
                    </label>
                    <div className="relative">
                      <UserRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="register-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Enter your full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`${inputClass} pl-11`}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="register-email" className="mb-2 block text-sm font-semibold text-[#3D4641]">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        placeholder="e.g. you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${inputClass} pl-11`}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="register-password" className="mb-2 block text-sm font-semibold text-[#3D4641]">
                      Password
                    </label>
                    <div className="relative">
                      <LockKeyhole size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="register-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputClass} pl-11 pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                        aria-pressed={showPassword}
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#8D9992] transition hover:bg-[#EFF7F3] hover:text-[#00665D]"
                      >
                        <span key={String(showPassword)} className="password-toggle-animation inline-flex">
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="register-confirm" className="mb-2 block text-sm font-semibold text-[#3D4641]">
                      Confirm password
                    </label>
                    <div className="relative">
                      <LockKeyhole size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="register-confirm"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputClass} pl-11 pr-4`}
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-[#89958E]">
                    Use at least 8 characters for your password.
                  </p>

                  {error && (
                    <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="group mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#00665D] px-5 py-3.5 text-sm font-semibold text-white transition duration-200 hover:bg-[#00564F] hover:shadow-lg hover:shadow-[#00665D]/15 active:scale-[.99]"
                  >
                    Create demo account
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-[#68746D]">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="font-semibold text-[#00665D] underline underline-offset-2 hover:text-[#003F3A]"
                  >
                    Back to Login
                  </button>
                </p>

                <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[#9AA49E]">
                  <ShieldCheck size={14} />
                  Demo registration · Details are not stored
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      <style>{`
        .sanchaya-register-page {
          box-sizing: border-box;
          width: 100%;
          min-height: calc(100vh - 4rem);
          padding: 28px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f7f8f7;
        }
        .sanchaya-register-frame {
          box-sizing: border-box;
          width: min(100%, 1000px);
          padding: 24px;
          background: #005e55;
          box-shadow: 0 18px 55px rgba(0, 49, 44, .10);
        }
        .sanchaya-register-grid {
          box-sizing: border-box;
          width: 100%;
          padding: 38px 20px;
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
        .sanchaya-register-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 410px;
          animation: sanchayaRegisterEnter .45s ease-out both;
        }
        .register-success-pop { animation: registerSuccessPop .5s cubic-bezier(.17,.67,.35,1.3) both; }
        @keyframes sanchayaRegisterEnter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes registerSuccessPop {
          0% { opacity: 0; transform: scale(.6); }
          75% { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 640px) {
          .sanchaya-register-page { min-height: calc(100vh - 4rem); padding: 16px 12px; }
          .sanchaya-register-frame { padding: 10px; }
          .sanchaya-register-grid { padding: 28px 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sanchaya-register-card, .register-success-pop { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
