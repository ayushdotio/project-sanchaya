const ROLES = [
  { id: "leader", title: "I lead the team", text: "Check what Sanchaya found, fix mistakes, and approve the handover before anyone sees it." },
  { id: "outgoing", title: "I am leaving the project", text: "Answer a few short questions so the knowledge in your head stays with the team." },
  { id: "incoming", title: "I am taking over", text: "Read the approved handover and see what to check and follow up." },
];

export default function RoleSelect({ onPick }) {
  return (
    <main className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
      <h1 className="text-4xl text-[#001E2B]">Who are you in this handover?</h1>
      <p className="mt-3 max-w-xl text-[#4A5F5B]">
        Pick the option that fits you. Each one shows only what you need, with steps to follow.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            className="flex flex-col rounded-2xl border border-[#E1E8E5] border-t-4 border-t-[#00ED64] bg-white p-6 text-left transition-shadow hover:shadow-[0_12px_30px_-14px_rgba(0,30,43,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#001E2B] focus-visible:ring-offset-2"
          >
            <span className="font-[Source_Serif_4,Georgia,serif] text-2xl font-semibold text-[#001E2B]">{r.title}</span>
            <span className="mt-3 flex-1 leading-7 text-[#4A5F5B]">{r.text}</span>
            <span className="mt-6 text-sm font-semibold text-[#001E2B] underline underline-offset-4">Continue</span>
          </button>
        ))}
      </div>
    </main>
  );
}
