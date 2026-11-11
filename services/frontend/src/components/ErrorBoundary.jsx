import React from "react";
import { AlertTriangle, RefreshCw, LogOut } from "lucide-react";
import { clearAuth } from "../api/client.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Sanchaya ErrorBoundary caught an unhandled error]:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleSignOut = () => {
    clearAuth();
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#F6FAF8] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl border border-[#F1D7D2] bg-white p-8 text-center shadow-lg">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF3E8] text-[#C47732] mb-4">
              <AlertTriangle size={28} />
            </div>
            <h1 className="text-xl font-bold text-[#001E2B]">Something went wrong</h1>
            <p className="mt-2 text-sm text-[#71817B] leading-6">
              A temporary issue occurred while rendering this page. You can reload or reset your session.
            </p>
            {this.state.error?.message && (
              <pre className="mt-4 p-3 rounded-xl bg-[#F8FCF9] border border-[#E1ECE6] text-xs text-[#A33F32] overflow-auto max-h-32 text-left whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#159B59] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#087A3D] transition"
              >
                <RefreshCw size={15} />
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleSignOut}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8E7DF] bg-white px-4 py-2.5 text-sm font-semibold text-[#29483B] hover:bg-[#F1FAF5] transition"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

