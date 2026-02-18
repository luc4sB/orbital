"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { X } from "lucide-react";

type TripPlanDoc = {
  title?: string;
  destination?: { country?: string; city?: string };
  dates?: { start?: string; end?: string };
  flights?: any[];
  hotels?: any[];
  itinerary?: any[];
};

function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function cmpDate(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export default function EditTripModal({
  open,
  onClose,
  conversationId,
  tripPlanId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  tripPlanId: string;
  initial: TripPlanDoc | null;
}) {
  const [mounted, setMounted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [flightsText, setFlightsText] = useState("");
  const [hotelsText, setHotelsText] = useState("");
  const [itineraryText, setItineraryText] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const seed = (d: TripPlanDoc | null) => {
      setTitle((d?.title ?? "").toString());
      setCountry((d?.destination?.country ?? "").toString());
      setCity((d?.destination?.city ?? "").toString());
      setStart((d?.dates?.start ?? "").toString());
      setEnd((d?.dates?.end ?? "").toString());
      setFlightsText(Array.isArray(d?.flights) ? d!.flights.map(String).join("\n") : "");
      setHotelsText(Array.isArray(d?.hotels) ? d!.hotels.map(String).join("\n") : "");
      setItineraryText(Array.isArray(d?.itinerary) ? d!.itinerary.map(String).join("\n") : "");
    };

    seed(initial);

    setLoading(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "tripPlans", tripPlanId));
        seed(snap.exists() ? ((snap.data() as any) as TripPlanDoc) : initial);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tripPlanId, initial]);

  if (!open || !mounted) return null;

  const startOk = !!start && isValidISODate(start);
  const endOk = !!end && isValidISODate(end);
  const rangeOk = startOk && endOk ? cmpDate(end, start) >= 0 : false;

  const canSave = title.trim().length > 0 && startOk && endOk && rangeOk && !busy;

  const toList = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 200);

  const save = async () => {
    if (!canSave) return;

    setBusy(true);
    try {
      const nextTitle = title.trim().slice(0, 80);
      const flights = toList(flightsText);
      const hotels = toList(hotelsText);
      const itinerary = toList(itineraryText);

      await updateDoc(doc(db, "tripPlans", tripPlanId), {
        title: nextTitle,
        destination: { country: country.trim(), city: city.trim() },
        dates: { start, end },
        flights,
        hotels,
        itinerary,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "conversations", conversationId), {
        lastTripPlan: {
          id: tripPlanId,
          title: nextTitle,
          destination: { country: country.trim(), city: city.trim() },
          dates: { start, end },
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      onClose();
    } finally {
      setBusy(false);
    }
  };

  const dateError = startOk && endOk && !rangeOk ? "End date must be after start date." : "";

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" onClick={onClose} />

      <div className="relative z-[10000] mx-auto w-full max-w-md px-4">
        <div className="mt-[max(16px,env(safe-area-inset-top))] mb-[max(16px,env(safe-area-inset-bottom))] rounded-3xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="text-sm font-semibold text-white/90">Edit trip plan</div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-3 overflow-y-auto min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Trip title…"
              disabled={loading}
              className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
                disabled={loading}
                className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                disabled={loading}
                className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={loading}
                className="w-full min-w-0 appearance-none bg-white/5 border border-white/10 rounded-full px-3 sm:px-4 py-2 text-[13px] sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              />
              <input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                disabled={loading}
                className="w-full min-w-0 appearance-none bg-white/5 border border-white/10 rounded-full px-3 sm:px-4 py-2 text-[13px] sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              />
            </div>
            {dateError ? <div className="text-[11px] text-pink-300/90">{dateError}</div> : null}

            <textarea
              value={flightsText}
              onChange={(e) => setFlightsText(e.target.value)}
              placeholder="Flights (one per line)…"
              disabled={loading}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60 resize-none"
            />

            <textarea
              value={hotelsText}
              onChange={(e) => setHotelsText(e.target.value)}
              placeholder="Hotels (one per line)…"
              disabled={loading}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60 resize-none"
            />

            <textarea
              value={itineraryText}
              onChange={(e) => setItineraryText(e.target.value)}
              placeholder="Itinerary (one per line)…"
              disabled={loading}
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60 resize-none"
            />
          </div>

          <div className="px-5 py-4 border-t border-white/10 shrink-0 bg-black/40 backdrop-blur-xl">
            <button
              type="button"
              onClick={save}
              disabled={!canSave || loading}
              className="w-full px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
