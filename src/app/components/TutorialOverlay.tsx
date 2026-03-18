"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SpotlightShape = "circle" | "rounded" | "square";

type Step = {
  id: string;
  text: string;
  target?: string;
  shape?: SpotlightShape;
  padding?: number;
  radius?: number;
  action?: () => void;
  choice?: "booking-type";
};

type SpotState =
  | { mode: "none" }
  | { mode: "circle"; x: number; y: number; radius: number }
  | {
      mode: "rect";
      left: number;
      top: number;
      width: number;
      height: number;
      borderRadius: number;
    };

type Props = {
  open: boolean;
  onClose: () => void;
};

const DEFAULT_SPOT: SpotState = { mode: "none" };
const STEP_LOCK_MS = 1000;

export default function TutorialOverlay({ open, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [bookingChoice, setBookingChoice] = useState<"flights" | "hotels" | null>(null);
  const [spot, setSpot] = useState<SpotState>(DEFAULT_SPOT);
  const [stepLocked, setStepLocked] = useState(false);

  const actionTimer = useRef<number | null>(null);
  const stepLockTimerRef = useRef<NodeJS.Timeout | null>(null);

  function lockStepTemporarily(ms = STEP_LOCK_MS) {
    setStepLocked(true);

    if (stepLockTimerRef.current) clearTimeout(stepLockTimerRef.current);

    stepLockTimerRef.current = setTimeout(() => {
      setStepLocked(false);
    }, ms);
  }

  const steps: Step[] = useMemo(() => {
    const base: Step[] = [
      {
        id: "globe-intro",
        text: "This is the Orbital globe. Drag to rotate and scroll to zoom.",
        target: "[data-tutorial='globe']",
        shape: "circle",
        radius: 250,
      },
      {
        id: "globe-italy",
        text: "You can click any country to explore it. Here we jump across to Italy.",
        action: () => {
          window.dispatchEvent(
            new CustomEvent("focus-country", {
              detail: { name: "Italy" },
            })
          );
        },
      },
      {
        id: "search-intro",
        text: "You can also jump instantly using the search bar.",
        target: "[data-tutorial='searchbar']",
        shape: "rounded",
        padding: 12,
        action: () => {
          window.dispatchEvent(new Event("tutorial-search-clear"));
        },
      },
      {
        id: "search-spain",
        text: "For example, type Spain and press Enter to select the top match.",
        action: () => {
          window.dispatchEvent(
            new CustomEvent("tutorial-search-demo", {
              detail: { value: "Spain" },
            })
          );
        },
      },
      {
        id: "search-spain-select",
        text: "Pressing Enter selects the top result and moves the globe straight there.",
        action: () => {
          window.dispatchEvent(
            new CustomEvent("tutorial-search-select", {
              detail: { name: "Spain" },
            })
          );
        },
      },
      {
        id: "booking-choice",
        text: "On the country panel, would you like to hear about Flights or Hotels?",
        choice: "booking-type",
        target: "[data-tutorial='country-panel-actions']",
        shape: "square",
        padding: 0,
      },
    ];

    if (bookingChoice === "flights") {
      base.push({
        id: "flights-explain",
        text: "Flights lets you choose a trip type, departure airport, and travel dates before viewing airport and route options for this country.",
        target: "[data-tutorial='country-panel-mode-flights']",
        shape: "rounded",
        padding: 8,
      });
    }

    if (bookingChoice === "hotels") {
      base.push({
        id: "hotels-explain",
        text: "Hotels lets you choose a city, dates, and guest count before viewing available accommodation options in this country.",
        target: "[data-tutorial='country-panel-mode-hotels']",
        shape: "rounded",
        padding: 8,
        action: () => {
          window.dispatchEvent(new Event("tutorial-click-hotels"));

          setTimeout(() => {
            window.dispatchEvent(new Event("tutorial-refresh-spotlight"));
          }, 80);

          setTimeout(() => {
            window.dispatchEvent(new Event("tutorial-refresh-spotlight"));
          }, 220);
        },
      });
    }

    base.push({
      id: "finish",
      text: "From here, you can continue searching travel options or return to exploring the globe.",
      target: "[data-tutorial='country-panel-actions']",
      shape: "square",
      padding: 0,
    });

    return base;
  }, [bookingChoice]);

  useEffect(() => {
    return () => {
      if (stepLockTimerRef.current) clearTimeout(stepLockTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setBookingChoice(null);
      setSpot(DEFAULT_SPOT);
      setStepLocked(false);

      if (stepLockTimerRef.current) clearTimeout(stepLockTimerRef.current);
      return;
    }

    window.dispatchEvent(new Event("tutorial-reset-globe"));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (stepIndex >= steps.length) {
      setStepIndex(Math.max(0, steps.length - 1));
    }
  }, [open, stepIndex, steps.length]);

  useEffect(() => {
    if (!open) return;

    const step = steps[stepIndex];
    if (!step) return;

    const updateSpot = () => {
      if (!step.target) {
        setSpot({ mode: "none" });
        return;
      }

      const el = document.querySelector(step.target);
      if (!el) {
        setSpot({ mode: "none" });
        return;
      }

      const rect = (el as HTMLElement).getBoundingClientRect();
      const padding = step.padding ?? 12;

      if (step.shape === "rounded") {
        setSpot({
          mode: "rect",
          left: rect.left - padding,
          top: rect.top - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
          borderRadius: Math.max(24, rect.height / 2 + padding),
        });
        return;
      }

      if (step.shape === "square") {
        setSpot({
          mode: "rect",
          left: rect.left - padding,
          top: rect.top - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
          borderRadius: 0,
        });
        return;
      }

      const radius = step.radius ?? Math.max(rect.width, rect.height) / 2 + padding;

      setSpot({
        mode: "circle",
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        radius,
      });
    };

    const refreshSpot = () => {
      requestAnimationFrame(() => {
        updateSpot();
      });
    };

    updateSpot();
    window.addEventListener("resize", updateSpot);
    window.addEventListener("scroll", updateSpot, true);
    window.addEventListener("tutorial-refresh-spotlight", refreshSpot);

    return () => {
      window.removeEventListener("resize", updateSpot);
      window.removeEventListener("scroll", updateSpot, true);
      window.removeEventListener("tutorial-refresh-spotlight", refreshSpot);
    };
  }, [open, stepIndex, steps]);

  useEffect(() => {
    if (!open) return;

    const step = steps[stepIndex];
    if (!step?.action) return;

    if (actionTimer.current) window.clearTimeout(actionTimer.current);

    actionTimer.current = window.setTimeout(() => {
      step.action?.();
    }, 450);

    return () => {
      if (actionTimer.current) {
        window.clearTimeout(actionTimer.current);
        actionTimer.current = null;
      }
    };
  }, [open, stepIndex, steps]);

  if (!open) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const handleBack = () => {
    if (stepLocked || stepIndex <= 0) return;
    lockStepTemporarily();
    setStepIndex((s) => s - 1);
  };

  const handleNext = () => {
    if (stepLocked) return;

    if (isLast) {
      onClose();
      return;
    }

    const currentStep = steps[stepIndex];
    const nextStep = steps[stepIndex + 1];

    const shouldResetBeforeSearch =
      currentStep?.id === "globe-italy" && nextStep?.id === "search-intro";

    lockStepTemporarily();

    if (shouldResetBeforeSearch) {
      window.dispatchEvent(new Event("tutorial-reset-globe"));

      setTimeout(() => {
        setStepIndex((s) => s + 1);
      }, 250);

      return;
    }

    setStepIndex((s) => s + 1);
  };

  const handleBookingChoice = (choice: "flights" | "hotels") => {
    if (stepLocked) return;
    lockStepTemporarily();
    setBookingChoice(choice);
    setStepIndex((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-[9999]">
      {spot.mode === "circle" && (
        <div
          className="absolute rounded-full border border-white/25 pointer-events-none transition-all duration-500"
          style={{
            left: spot.x - spot.radius,
            top: spot.y - spot.radius,
            width: spot.radius * 2,
            height: spot.radius * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
      )}

      {spot.mode === "rect" && (
        <div
          className="absolute border border-white/25 pointer-events-none transition-all duration-500"
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
            borderRadius: `${spot.borderRadius}px`,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
      )}

      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close guided tour"
      />

      <div className="absolute left-1/2 bottom-6 -translate-x-1/2 w-[min(92vw,640px)] rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-white/10 dark:bg-zinc-900 dark:text-white">
        <div className="p-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-500">
            Guided tour · Step {stepIndex + 1} of {steps.length}
          </div>

          <p className="text-sm sm:text-base">{step.text}</p>

          {step.choice === "booking-type" && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={stepLocked}
                onClick={() => handleBookingChoice("flights")}
                className="rounded-xl px-4 py-3 bg-sky-500 hover:bg-sky-600 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tell me about Flights
              </button>

              <button
                type="button"
                disabled={stepLocked}
                onClick={() => handleBookingChoice("hotels")}
                className="rounded-xl px-4 py-3 bg-pink-500 hover:bg-pink-600 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tell me about Hotels
              </button>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/20 transition"
            >
              Skip
            </button>

            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  disabled={stepLocked}
                  onClick={handleBack}
                  className="rounded-lg px-3 py-2 text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              )}

              {!step.choice && (
                <button
                  type="button"
                  disabled={stepLocked}
                  onClick={handleNext}
                  className="rounded-lg px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLast ? "Finish" : "Next"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}