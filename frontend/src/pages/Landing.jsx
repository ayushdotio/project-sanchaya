import Nav from "../components/Nav";
import {
  ArrowRight,
  GitBranch,
  ShieldCheck,
  FileSearch,
  RefreshCw,
  Users,
  CheckCircle2,
  CircleAlert,
  ArrowUpRight,
} from "lucide-react";

const primary =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-[#00665D] px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00564F] hover:shadow-lg hover:shadow-[#00665D]/15 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#00665D]/20";

const secondary =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-[#B9D8CC] bg-white px-6 py-3 text-sm font-semibold text-[#00665D] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#00665D] hover:bg-[#F1F8F4]";

const STAGES = [
  {
    number: "01",
    title: "Connect",
    description: "Bring together GitHub activity, meeting notes and task records.",
    icon: GitBranch,
  },
  {
    number: "02",
    title: "Reconstruct",
    description: "Identify decisions, owners, blockers and project dependencies.",
    icon: RefreshCw,
  },
  {
    number: "03",
    title: "Verify",
    description: "Trace each finding back to its source and flag missing evidence.",
    icon: FileSearch,
  },
  {
    number: "04",
    title: "Review",
    description: "Let the team leader review, edit, approve or reject findings.",
    icon: ShieldCheck,
  },
  {
    number: "05",
    title: "Handover",
    description: "Prepare a clear continuation plan for the incoming teammate.",
    icon: Users,
  },
];

const FEATURES = [
  {
    title: "Evidence behind every finding",
    description:
      "See the source text behind each claim, so your team can verify information instead of relying on an unexplained summary.",
    icon: FileSearch,
  },
  {
    title: "Knowledge gaps made visible",
    description:
      "Spot missing owners, unanswered questions and conflicting records before they become handover problems.",
    icon: CircleAlert,
  },
  {
    title: "Human review stays in control",
    description:
      "Team leaders can inspect, edit, approve or reject findings before knowledge is shared with the next person.",
    icon: ShieldCheck,
  },
  {
    title: "A clearer next step",
    description:
      "Turn approved knowledge into a practical handover view that helps the incoming teammate continue the work.",
    icon: ArrowRight,
  },
];

function SanchayaMark() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D8EDE3] bg-[#EAF7F1]">
      <svg width="27" height="27" viewBox="0 0 64 64" fill="none" aria-label="Sanchaya logo">
        <path d="M32 7L55 20L32 33L9 20L32 7Z" fill="#087A6F" />
        <path d="M9 29L32 42L55 29M9 40L32 53L55 40" stroke="#087A6F" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function EvidencePreview() {
  return (
    <div className="relative mx-auto w-full max-w-[510px]">
      <div className="absolute -inset-5 rounded-[2rem] bg-[#087A6F]/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.6rem] border border-[#DCE9E2] bg-white p-5 shadow-[0_24px_70px_rgba(0,45,39,0.12)] sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-[#E9EFEB] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF7F1] text-[#087A6F]">
              <FileSearch size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#263B32]">Evidence review</p>
              <p className="mt-0.5 text-xs text-[#839087]">Project Alpha · Finding #024</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4E8] px-3 py-1.5 text-xs font-semibold text-[#A45B19]">
            <CircleAlert size={13} />
            Conflicting
          </span>
        </div>

        <div className="py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#087A6F]">
            Finding to verify
          </p>
          <h3 className="mt-2 font-serif text-[23px] font-semibold leading-snug text-[#263B32]">
            The database migration is complete.
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#6B7971]">
            Two project sources contain different updates. Review the evidence before approving this finding.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#DDEBE3] bg-[#F7FBF8] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-[#466354]">Meeting notes</p>
              <span className="rounded-full bg-[#E4F4EA] px-2 py-1 text-[10px] font-semibold text-[#087A6F]">16 Mar</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#45564D]">
              “Migration done on staging.”
            </p>
          </div>
          <div className="rounded-xl border border-[#F0E2D5] bg-[#FFFAF5] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-[#76583F]">Task board</p>
              <span className="rounded-full bg-[#F8EBDD] px-2 py-1 text-[10px] font-semibold text-[#A45B19]">30 Mar</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#6D5948]">
              “Migrate event collection · In progress”
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E9EFEB] pt-4">
          <div>
            <p className="text-xs font-semibold text-[#34483D]">Human review required</p>
            <p className="mt-1 text-[11px] text-[#89958E]">Evidence remains traceable to its source</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF7F1] px-3 py-1.5 text-xs font-semibold text-[#087A6F]">
              <CheckCircle2 size={13} /> Approve
            </span>
            <span className="rounded-full border border-[#E1E7E3] px-3 py-1.5 text-xs font-semibold text-[#6C7971]">
              Review
            </span>
          </div>
        </div>
      </div>
     
    </div>
  );
}

export default function Landing({ onStart }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F7F9F7] text-[#263B32]">
      <Nav>
        <a href="#how" className="hidden text-sm font-medium text-[#52645A] transition hover:text-[#00665D] sm:inline">
          How it works
        </a>
        <a href="#features" className="hidden text-sm font-medium text-[#52645A] transition hover:text-[#00665D] sm:inline">
          Features
        </a>
        <button type="button" onClick={onStart} className={primary}>
          Get started <ArrowRight size={16} />
        </button>
      </Nav>

      <main>
        {/* HERO */}
        <section className="relative isolate overflow-hidden bg-[#F7F9F7]">
          <div className="pointer-events-none absolute -right-36 -top-36 h-[430px] w-[430px] rounded-full bg-[#DFF3E8] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 left-0 h-[360px] w-[360px] rounded-full bg-[#E7F2ED] blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.02fr] lg:gap-16 lg:py-24">
            <div className="landing-home-enter">
              <div className="mb-7 flex items-center gap-3">
                <SanchayaMark />
                <div>
                  <p className="text-lg font-bold tracking-tight text-[#173B32]">Sanchaya</p>
                  <p className="text-[9px] font-semibold tracking-[0.18em] text-[#718078]">PRESERVING KNOWLEDGE</p>
                </div>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-[#CDE6D8] bg-white/80 px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-[#087A6F] shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#087A6F]" />
                PROJECT KNOWLEDGE CONTINUITY
              </span>

              <h1 className="mt-7 max-w-2xl font-serif text-[42px] font-semibold leading-[1.08] tracking-tight text-[#263B32] sm:text-5xl lg:text-[58px]">
                Handovers backed by proof,
                <span className="mt-1 block text-[#087A6F]">not guesswork.</span>
              </h1>

              <p className="mt-6 max-w-xl text-[15px] leading-8 text-[#68766E] sm:text-base">
                Sanchaya brings project knowledge together, connects findings to their original sources, and makes missing or conflicting information visible before a handover is approved.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={onStart} className={primary}>
                  Start a handover <ArrowRight size={17} />
                </button>
                <a href="#how" className={secondary}>
                  Explore the process <ArrowUpRight size={16} />
                </a>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#E2EAE5] pt-6 text-xs font-medium text-[#68766E]">
                <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#087A6F]" /> Evidence-backed</span>
                <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#087A6F]" /> Human-reviewed</span>
                <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#087A6F]" /> Continuity-focused</span>
              </div>
            </div>

            <div className="landing-preview-enter py-3">
              <EvidencePreview />
            </div>
          </div>
        </section>

        {/* TRUST STRIP */}
        <section className="border-y border-[#E5ECE7] bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 text-center sm:grid-cols-3 sm:px-8">
            {[
              ["Traceable information", "Every finding points back to its source"],
              ["Visible uncertainty", "Gaps and conflicts are not hidden"],
              ["Human approval", "People stay in control of handovers"],
            ].map(([title, description]) => (
              <div key={title} className="px-3">
                <p className="text-sm font-bold text-[#30483B]">{title}</p>
                <p className="mt-1 text-xs leading-5 text-[#849087]">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold tracking-[0.2em] text-[#087A6F]">THE PROCESS</p>
              <h2 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-[#263B32] sm:text-4xl">
                From scattered activity to a clear handover
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#718078] sm:text-base">
                Five connected stages help turn project records into knowledge the next teammate can review and use.
              </p>
            </div>

            <ol className="mt-12 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <li
                    key={stage.number}
                    className="landing-stage-card group rounded-2xl border border-[#E1EBE5] bg-[#FBFDFC] p-5 transition duration-300 hover:-translate-y-1 hover:border-[#A8D5BC] hover:bg-white hover:shadow-[0_16px_35px_rgba(0,70,52,.08)]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold tracking-widest text-[#087A6F]">{stage.number}</span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF7F1] text-[#087A6F] transition duration-300 group-hover:bg-[#00665D] group-hover:text-white">
                        <Icon size={19} />
                      </span>
                    </div>
                    <h3 className="mt-6 text-lg font-bold text-[#2D4337]">{stage.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#718078]">{stage.description}</p>
                    <div className="mt-6 h-1 w-10 rounded-full bg-[#B7E5C9] transition-all duration-300 group-hover:w-full group-hover:bg-[#087A6F]" />
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="bg-[#F0F7F3] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold tracking-[0.2em] text-[#087A6F]">WHY SANCHAYA</p>
              <h2 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-[#263B32] sm:text-4xl">
                Confidence at every handover stage.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#718078] sm:text-base">
                Keep important project knowledge traceable, reviewable and ready for the people who continue the work.
              </p>
            </div>

            <div className="mt-11 grid gap-5 md:grid-cols-2">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="group flex gap-4 rounded-2xl border border-[#E0EAE3] bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-[#B5DCC4] hover:shadow-[0_16px_35px_rgba(0,70,52,.07)] sm:p-7"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF7F1] text-[#087A6F] transition group-hover:bg-[#00665D] group-hover:text-white">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-[#2D4337]">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-[#718078]">{feature.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="relative overflow-hidden bg-[#004F49] py-20 text-white sm:py-24">
          <div className="pointer-events-none absolute -right-20 -top-40 h-96 w-96 rounded-full bg-[#00ED64]/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl px-5 text-center">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#A8E8C2]">KEEP KNOWLEDGE MOVING</p>
            <h2 className="mt-4 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Make the next handover easier to continue.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/75 sm:text-base">
              Explore how Sanchaya helps teams review project knowledge and prepare a clearer continuation plan.
            </p>
            <button
              type="button"
              onClick={onStart}
              className="mt-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-bold text-[#00564F] transition hover:-translate-y-0.5 hover:bg-[#EAF7F1] hover:shadow-lg"
            >
              Get started <ArrowRight size={17} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2EAE5] bg-white px-5 py-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <SanchayaMark />
          <span className="font-bold text-[#263B32]">Sanchaya</span>
        </div>
        <p className="mt-3 text-xs text-[#718078]">
          Preserving Knowledge. Connecting People. Continuing Projects.
        </p>
        <p className="mt-2 text-[11px] text-[#9AA49E]">
          Team Epsilum · NMIET Pune · CodeFrontier Round 2
        </p>
      </footer>

      <style>{`
        .landing-home-enter { animation: landingHomeEnter .55s ease-out both; }
        .landing-preview-enter { animation: landingPreviewEnter .7s ease-out .08s both; }
        @keyframes landingHomeEnter {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landingPreviewEnter {
          from { opacity: 0; transform: translateY(16px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-home-enter, .landing-preview-enter { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
