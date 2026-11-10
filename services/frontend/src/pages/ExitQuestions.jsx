
import { useEffect, useState } from "react";
import { getFindings } from "../api/findingsApi";

export default function ExitQuestions() {
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getFindings().then((all) => {
      setItems(all.filter((f) => f.status !== "supported"));
    });
  }, []);

  function handleSubmit() {
    const handoverData = {
      answers,
      additionalInfo,
    };

    // Demo only: data is not saved to the backend yet.
    console.log("Outgoing member handover:", handoverData);

    setSent(true);
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="text-4xl text-[#001E2B]">
          Thank you
        </h1>

        <p className="mt-4 text-lg leading-8 text-[#4A5F5B]">
          Your handover information has been collected in this demo.
          It will need backend integration before your team leader
          can access it.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <h1 className="text-4xl text-[#001E2B]">
        What only you know
      </h1>

      <p className="mt-3 text-[#4A5F5B]">
        Answer the questions below and add any important information
        that the system has missed.
      </p>

      {/* System-generated questions */}
      <h2 className="mt-8 text-xl font-bold text-[#001E2B]">
        Questions from project findings
      </h2>

      <ul className="m-0 mt-5 list-none space-y-6 p-0">
        {items.map((f, i) => (
          <li
            key={f.id}
            className="rounded-2xl border border-[#E1E8E5] bg-white p-5"
          >
            <label
              htmlFor={f.id}
              className="block text-lg font-semibold text-[#001E2B]"
            >
              {i + 1}. {f.claim}
            </label>

            <p className="mt-1 text-sm text-[#4A5F5B]">
              What is the real situation, and what should happen next?
            </p>

            <textarea
              id={f.id}
              rows={3}
              value={answers[f.id] ?? ""}
              onChange={(e) =>
                setAnswers({
                  ...answers,
                  [f.id]: e.target.value,
                })
              }
              placeholder="Write your answer here..."
              className="mt-3 w-full rounded-lg border border-[#C9CFDC] p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#001E2B]"
            />
          </li>
        ))}
      </ul>

      {/* Member-added information */}
      <section className="mt-10 rounded-2xl border border-[#CDE9D8] bg-[#F0F8F4] p-6">
        <h2 className="text-xl font-bold text-[#001E2B]">
          Additional Information
        </h2>

        <p className="mt-2 text-sm text-[#4A5F5B]">
          Is there anything important about the project that
          the system has not asked you?
        </p>

        <textarea
          rows={6}
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          placeholder="Add project knowledge, technical details, unfinished work, decisions, blockers, suggestions, or anything the next member should know..."
          className="mt-4 w-full rounded-lg border border-[#C9CFDC] bg-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#001E2B]"
        />

        <p className="mt-2 text-xs text-[#71817B]">
          You can add information even when there are no pending questions.
        </p>
      </section>

      <button
        type="button"
        onClick={handleSubmit}
        className="mt-8 rounded-full bg-[#00ED64] px-6 py-3 text-sm font-semibold text-[#001E2B] hover:bg-[#00D75B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#001E2B] focus-visible:ring-offset-2"
      >
        Submit My Handover
      </button>
    </main>
  );
}
