// A short "what to do here" strip shown at the top of every role page.
export default function Guide({ title, steps }) {
  return (
    <section aria-label="What to do on this page" className="border-b border-[#CDEFE3] bg-[#E3FCF7]">
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <h2 className="mb-3 text-lg text-[#001E2B]">{title}</h2>
        <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
          {steps.map((text, i) => (
            <li key={text} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#001E2B] text-sm font-bold text-[#00ED64]">
                {i + 1}
              </span>
              <span className="pt-0.5 text-[15px] text-[#001E2B]">{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
