import { useState } from "react";
import {
  Mail,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { forgotPassword, resetPassword } from "../api/authApi";

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
  const [step, setStep] = useState("request"); // "request" | "reset" | "complete"
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequestToken(event) {
    event.preventDefault();
    setError("");
    setMessage("");

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
    try {
      const response = await forgotPassword(cleanEmail);
      const devToken = response?.data?.resetToken;
      if (devToken) {
        setToken(devToken);
        setMessage("Password reset token generated. Set your new password below.");
      } else {
        setMessage(
          response?.message ||
            "If that email is registered, password reset instructions have been generated."
        );
      }
      setStep("reset");
    } catch (err) {
      setError(err?.message || "Failed to request password reset token.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError("");

    const cleanToken = token.trim();
    if (!cleanToken || cleanToken.length !== 64) {
      setError("Reset token must be a valid 64-character token.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("New password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("New password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setError("New password must contain at least one special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(cleanToken, newPassword);
      setStep("complete");
    } catch (err) {
      setError(err?.message || "Failed to reset password. The token may be expired or invalid.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sanchaya-forgot-page">
      <div className="sanchaya-forgot-frame">
        <section className="sanchaya-forgot-grid">
          <div className="sanchaya-forgot-card">
            {step === "complete" ? (
              <div className="py-5 text-center forgot-content-enter">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#087A6F] bg-[#EAF7F1] text-[#087A6F] forgot-success-pop">
                  <CheckCircle2 size={43} />
                </div>
                <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-[#087A6F]">
                  PASSWORD RESET COMPLETE
                </p>
                <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#303632]">
                  Password updated
                </h1>
                <p className="mt-3 text-sm leading-6 text-[#68746D]">
                  Your password has been securely updated and previous sessions have been invalidated.
                  You can now sign in with your new credentials.
                </p>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#00665D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#00564F]"
                >
                  <ArrowLeft size={16} />
                  Return to Login
                </button>
              </div>
            ) : step === "reset" ? (
              <div className="forgot-content-enter">
                <div className="mb-4 flex justify-center">
                  <SanchayaMark />
                </div>

                <header className="text-center">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#087A6F]">
                    ACCOUNT RECOVERY · STEP 2
                  </p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#303632] sm:text-[34px]">
                    Set new password
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-[#68746D]">
                    {message || "Enter your 64-character reset token and choose a new password."}
                  </p>
                </header>

                <form onSubmit={handleResetPassword} noValidate className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="reset-token" className="mb-1.5 block text-xs font-semibold text-[#3D4641]">
                      Reset Token (64-character token)
                    </label>
                    <div className="relative">
                      <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="reset-token"
                        type="text"
                        autoComplete="off"
                        placeholder="Paste 64-char reset token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={loading}
                        className={`${inputClass} pl-11 font-mono text-xs`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-[#3D4641]">
                      New Password
                    </label>
                    <div className="relative">
                      <LockKeyhole size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Min 8 chars, 1 uppercase, 1 number, 1 symbol"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={loading}
                        className={`${inputClass} pl-11 pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA49E] hover:text-[#3D4641]"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-semibold text-[#3D4641]">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <LockKeyhole size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9AA49E]" />
                      <input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Repeat your new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
                        className={`${inputClass} pl-11`}
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#00665D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#00564F] disabled:opacity-60"
                  >
                    {loading ? "Updating password..." : "Apply New Password"}
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("request");
                        setError("");
                      }}
                      className="font-semibold text-[#00665D] hover:underline"
                    >
                      ← Request another token
                    </button>
                    <button
                      type="button"
                      onClick={onBackToLogin}
                      className="text-[#68746D] hover:underline"
                    >
                      Back to Login
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="forgot-content-enter">
                <div className="mb-4 flex justify-center">
                  <SanchayaMark />
                </div>

                <header className="text-center">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#087A6F]">
                    ACCOUNT RECOVERY · STEP 1
                  </p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#303632] sm:text-[34px]">
                    Forgot password?
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-[#68746D]">
                    Enter the email address linked to your Sanchaya account to request a password reset token.
                  </p>
                </header>

                <form onSubmit={handleRequestToken} noValidate className="mt-7">
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
                        Generating reset token...
                      </>
                    ) : (
                      <>
                        Generate Reset Token
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>

                  <div className="mt-5 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("reset");
                        setError("");
                      }}
                      className="font-medium text-[#00665D] hover:underline"
                    >
                      Already have a token?
                    </button>

                    <button
                      type="button"
                      onClick={onBackToLogin}
                      disabled={loading}
                      className="font-semibold text-[#00665D] underline underline-offset-2 hover:text-[#003F3A]"
                    >
                      Back to Login
                    </button>
                  </div>
                </form>

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
          max-width: 420px;
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
