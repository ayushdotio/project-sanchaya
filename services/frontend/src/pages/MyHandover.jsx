import { useEffect, useState } from "react";
import { getSources } from "../api/findingsApi";
import { StatusBadge } from "../components/Badges";

function Item({ f, sources }) {
  return (
    <li className="rounded-2xl border border-[#E1E8E5] bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={f.status} />
        <span className="text-sm text-[#4A5F5B]">{f.category}</span>
      </div>
      <p className="text-lg font-semibold text-[#001E2B]">{f.claim}</p>
      {f.evidence.map((e) => (
        <p key={e.sourceId} className="mt-3 text-sm leading-6 text-[#4A5F5B]">
          From {sources[e.sourceId]?.title ?? e.sourceId}:{" "}
          <span className="rounded-sm bg-[#CFF8E0] px-1 text-[#001E2B]">{e.excerpt}</span>
        </p>
      ))}
    </li>
  );
}

// For the person taking over. Shows only findings the team leader approved.
export default function MyHandover({ approved, title = "Your handover" }) {
  const [sources, setSources] = useState({});
  useEffect(() => {
    getSources().then((s) => setSources(Object.fromEntries(s.map((x) => [x.id, x]))));
  }, []);

  if (approved.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="text-4xl text-[#001E2B]">{title} is not ready yet</h1>
        <p className="mt-4 text-lg leading-8 text-[#4A5F5B]">
          Your team leader has not shared it. You will see it here once they approve it.
        </p>
      </main>
    );
  }

  const sure = approved.filter((f) => f.status === "supported");
  const follow = approved.filter((f) => f.status !== "supported");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <h1 className="text-4xl text-[#001E2B]">{title}</h1>
      <h2 className="mt-8 text-2xl text-[#001E2B]">What is confirmed</h2>
      <ul className="m-0 mt-4 list-none space-y-4 p-0">{sure.map((f) => <Item key={f.id} f={f} sources={sources} />)}</ul>
      <h2 className="mt-10 text-2xl text-[#001E2B]">What you should follow up</h2>
      <p className="mt-1 text-[#4A5F5B]">These points are unclear or disputed. Check them before relying on them.</p>
      <ul className="m-0 mt-4 list-none space-y-4 p-0">{follow.map((f) => <Item key={f.id} f={f} sources={sources} />)}</ul>
    </main>
  );
}
