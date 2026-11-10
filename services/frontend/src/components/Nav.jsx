
export default function Nav({ onHome, children }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-[#1C3A47] bg-[#001E2B]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">

        <div className="group relative flex items-center gap-3">

          {/* Sanchaya Logo */}
          <button
            type="button"
            onClick={onHome}
            aria-label="Sanchaya Home"
            className="flex items-center gap-3 rounded-lg bg-transparent p-1 text-white focus-visible:ring-2 focus-visible:ring-[#00ED64]"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M9 13L24 5L39 13L24 21L9 13Z"
                fill="#00ED64"
              />
              <path
                d="M9 21L24 29L39 21"
                stroke="#00ED64"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 29L24 37L39 29"
                stroke="#00ED64"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 37L24 45L39 37"
                stroke="#00ED64"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <span className="text-lg font-bold tracking-tight">
              Sanchaya
            </span>
          </button>

          {/* Hover Tagline */}
          <div className="pointer-events-none invisible absolute left-0 top-12 z-50 w-80 translate-y-2 rounded-xl border border-[#1C3A47] bg-[#082F3B] p-4 opacity-0 shadow-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <p className="text-sm font-semibold leading-6 text-white">
              Preserving Knowledge.
              <span className="block text-[#00ED64]">
                Connecting People.
              </span>
              Continuing Projects.
            </p>
          </div>

        </div>

        <div className="flex items-center gap-6 text-sm text-[#B8C4C2]">
          {children}
        </div>
      </div>
    </nav>
  );
}
