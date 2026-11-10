
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

import {
  FileText,
  CheckCircle2,
  Clock3,
  AlertTriangle,
} from "lucide-react";

const icons = {
  total: FileText,
  supported: CheckCircle2,
  review: Clock3,
  conflicting: AlertTriangle,
};

export default function StatsCard({
  title,
  value,
  description,
  type = "total",
  trend,
}) {
  const Icon = icons[type] || FileText;

  const [count, setCount] = useState(0);

  const numericValue = Number(value);

  const iconColors = {
    total: "bg-blue-50 text-blue-600",
    supported: "bg-green-50 text-green-600",
    review: "bg-amber-50 text-amber-600",
    conflicting: "bg-red-50 text-red-600",
  };

  useEffect(() => {
if (!Number.isFinite(numericValue)) {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setCount(0);
  return;
}

    const duration = 1000;
    let animationFrame;
    let startTime = null;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setCount(numericValue);
      return;
    }

    setCount(0);

    function animate(currentTime) {
      if (!startTime) startTime = currentTime;

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out counting effect
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setCount(Math.round(numericValue * easedProgress));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    }

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [numericValue]);

  return (
    <Card className="border border-[#E1EAE5] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-[#64756F]">
              {title}
            </p>

            <h3
              className="mt-3 text-3xl font-bold tracking-tight text-[#001E2B] tabular-nums"
              aria-live="polite"
            >
              {Number.isFinite(numericValue)
                ? count.toLocaleString("en-IN")
                : value}
            </h3>
          </div>

          <div
            className={`rounded-xl p-3 ${
              iconColors[type] || iconColors.total
            }`}
          >
            <Icon size={22} strokeWidth={1.8} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-[#71817B]">
            {description}
          </p>

          {trend && (
            <span className="text-xs font-semibold text-[#159B59]">
              {trend}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
