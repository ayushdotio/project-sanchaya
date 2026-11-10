// Chips always show a text label as well as a colour, so status never relies on colour alone.
/* eslint-disable react-refresh/only-export-components */
export const STATUS = {
  supported: {
    label: "Supported",
    dot: "bg-[#1E7F4F]",
    text: "text-[#17603B]",
    tint: "bg-[#E6F4EC]",
    bar: "bg-[#1E7F4F]",
    edge: "border-[#1E7F4F]",
  },
  needs_review: {
    label: "Needs review",
    dot: "bg-[#A86A0C]",
    text: "text-[#8A5509]",
    tint: "bg-[#FBF1DC]",
    bar: "bg-[#A86A0C]",
    edge: "border-[#A86A0C]",
  },
  conflicting: {
    label: "Conflicting",
    dot: "bg-[#C0392B]",
    text: "text-[#9B2D22]",
    tint: "bg-[#FBE9E7]",
    bar: "bg-[#C0392B]",
    edge: "border-[#C0392B]",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-[#6B7280]",
    text: "text-[#4B5563]",
    tint: "bg-[#ECEEF2]",
    bar: "bg-[#6B7280]",
    edge: "border-[#6B7280]",
  },
};

export const REVIEW_LABEL = {
  pending: "Not reviewed yet",
  approved: "Approved by reviewer",
  rejected: "Rejected by reviewer",
};

const chip =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return (
    <span className={`${chip} ${s.tint} ${s.text}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function FreshnessBadge({ recheck, reason }) {
  if (!recheck) return null;
  return (
    <span className={`${chip} bg-[#FDEBDD] text-[#99480F]`} title={reason}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#D9650F]" />
      Re-check recommended
    </span>
  );
}

export function ReviewBadge({ review, edited }) {
  if (review === "pending" && !edited) return null;
  const tone =
    review === "approved"
      ? "bg-[#001E2B] text-white"
      : review === "rejected"
        ? "bg-[#E1E8E5] text-[#001E2B]"
        : "bg-white text-[#4A5F5B] ring-1 ring-[#E1E8E5]";
  return (
    <span className="inline-flex gap-1">
      {review !== "pending" && <span className={`${chip} ${tone}`}>{REVIEW_LABEL[review]}</span>}
      {edited && <span className={`${chip} bg-white text-[#4A5F5B] ring-1 ring-[#E1E8E5]`}>Edited</span>}
    </span>
  );
}
