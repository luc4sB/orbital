"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { X } from "lucide-react";
import citiesByCountry from "../../../../public/data/cities.json";
import countryContinent from "../../../../public/data/country_continent.json";

type CountriesRow = { country: string; continent?: string };

type TripPlanDraft = {
  title: string;
  start: string;
  end: string;
};

function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function cmpDate(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export default function CreateTripModal({
  open,
  onClose,
  conversation,
}: {
  open: boolean;
  onClose: () => void;
  conversation: { id: string; memberIds: string[] } | null;
}) {
  const { user } = useAuth();

  const countries = useMemo(() => {
    const rows = countryContinent as CountriesRow[];
    return rows
      .map((r) => r.country)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, []);

  const [draft, setDraft] = useState<TripPlanDraft>({
    title: "",
    start: "",
    end: "",
  });

  const [busy, setBusy] = useState(false);

  const [countryQuery, setCountryQuery] = useState("");
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");

  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");

  const countryBoxRef = useRef<HTMLDivElement | null>(null);
  const cityBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ title: "", start: "", end: "" });
    setBusy(false);
    setCountryQuery("");
    setCountrySuggestions([]);
    setSelectedCountry("");
    setCityQuery("");
    setCitySuggestions([]);
    setSelectedCity("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (countryBoxRef.current && !countryBoxRef.current.contains(t)) setCountrySuggestions([]);
      if (cityBoxRef.current && !cityBoxRef.current.contains(t)) setCitySuggestions([]);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCountrySuggestions([]);
        setCitySuggestions([]);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  const citiesForCountry = selectedCountry
    ? ((citiesByCountry as Record<string, string[]>)[selectedCountry] ?? [])
    : [];

  const startOk = !!draft.start && isValidISODate(draft.start);
  const endOk = !!draft.end && isValidISODate(draft.end);
  const rangeOk = startOk && endOk ? cmpDate(draft.end, draft.start) >= 0 : false;

  const canCreate =
    !!user &&
    !!conversation &&
    draft.title.trim().length > 0 &&
    !!selectedCountry &&
    !!selectedCity &&
    startOk &&
    endOk &&
    rangeOk &&
    !busy;

  const updateCountryQuery = (value: string) => {
    setCountryQuery(value);
    setSelectedCountry("");
    setCityQuery("");
    setSelectedCity("");
    setCitySuggestions([]);

    const v = value.trim().toLowerCase();
    if (!v) {
      setCountrySuggestions([]);
      return;
    }

    const filtered = countries.filter((c) => c.toLowerCase().includes(v)).slice(0, 8);
    setCountrySuggestions(filtered);
  };

  const selectCountry = (c: string) => {
    setSelectedCountry(c);
    setCountryQuery(c);
    setCountrySuggestions([]);
    setCityQuery("");
    setSelectedCity("");
    setCitySuggestions([]);
  };

  const updateCityQuery = (value: string) => {
    setCityQuery(value);
    setSelectedCity("");

    const v = value.trim().toLowerCase();
    if (!v || !selectedCountry) {
      setCitySuggestions([]);
      return;
    }

    const filtered = citiesForCountry.filter((c) => c.toLowerCase().includes(v)).slice(0, 8);
    setCitySuggestions(filtered);
  };

  const selectCity = (c: string) => {
    setSelectedCity(c);
    setCityQuery(c);
    setCitySuggestions([]);
  };

  const create = async () => {
    if (!canCreate) return;

    setBusy(true);
    try {
      const title = draft.title.trim().slice(0, 80);
      const country = selectedCountry;
      const city = selectedCity;
      const start = draft.start;
      const end = draft.end;

      const tripRef = await addDoc(collection(db, "tripPlans"), {
        conversationId: conversation!.id,
        createdBy: user!.uid,
        memberIds: conversation!.memberIds,
        title,
        destination: { country, city },
        dates: { start, end },
        flights: [],
        hotels: [],
        itinerary: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "conversations", conversation!.id, "messages"), {
        senderId: user!.uid,
        type: "tripPlan",
        text: `Trip plan: ${title}`,
        tripPlanId: tripRef.id,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "conversations", conversation!.id), {
        updatedAt: serverTimestamp(),
        lastTripPlan: {
          id: tripRef.id,
          title,
          destination: { country, city },
          dates: { start, end },
          createdAt: serverTimestamp(),
        },
        lastMessage: {
          text: `Trip plan: ${title}`,
          senderId: user!.uid,
          createdAt: serverTimestamp(),
        },
      });

      setDraft({ title: "", start: "", end: "" });
      setCountryQuery("");
      setCountrySuggestions([]);
      setSelectedCountry("");
      setCityQuery("");
      setCitySuggestions([]);
      setSelectedCity("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const countryError = countryQuery.trim().length > 0 && !selectedCountry ? "Select a country from the dropdown." : "";
  const cityError = cityQuery.trim().length > 0 && !selectedCity ? "Select a city from the dropdown." : "";
  const dateError = startOk && endOk && !rangeOk ? "End date must be after start date." : "";

  return (
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" onClick={onClose} />

      <div className="relative z-[131] mx-auto w-full max-w-md px-4 pt-10">
        <div className="rounded-3xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">Create trip plan</div>
            <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <input
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder="Trip title…"
              className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />

            <div className="relative" ref={countryBoxRef}>
              <input
                value={countryQuery}
                onChange={(e) => updateCountryQuery(e.target.value)}
                placeholder="Country"
                className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />

              {countrySuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-xl overflow-hidden z-[140]">
                  {countrySuggestions.map((c, idx) => (
                    <button
                      key={`country:${c}:${idx}`}
                      type="button"
                      onClick={() => selectCountry(c)}
                      className="w-full text-left px-4 py-2 text-sm text-white/90 hover:bg-white/10 transition"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {countryError && <div className="text-[11px] text-pink-300/90">{countryError}</div>}

            <div className="relative" ref={cityBoxRef}>
              <input
                value={cityQuery}
                onChange={(e) => updateCityQuery(e.target.value)}
                placeholder={selectedCountry ? "City" : "Pick country first"}
                disabled={!selectedCountry}
                className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              />

              {citySuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-xl overflow-hidden z-[140]">
                  {citySuggestions.map((c, idx) => (
                    <button
                      key={`${selectedCountry}:${c}:${idx}`}
                      type="button"
                      onClick={() => selectCity(c)}
                      className="w-full text-left px-4 py-2 text-sm text-white/90 hover:bg-white/10 transition"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {cityError && <div className="text-[11px] text-pink-300/90">{cityError}</div>}

            <div className="space-y-2">
              <input
                type="date"
                value={draft.start}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    start: e.target.value,
                    end: p.end && e.target.value && cmpDate(p.end, e.target.value) < 0 ? "" : p.end,
                  }))
                }
                className="w-full min-w-0 appearance-none bg-white/5 border border-white/10 rounded-full px-3 sm:px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />

              <input
                type="date"
                value={draft.end}
                min={draft.start || undefined}
                onChange={(e) => setDraft((p) => ({ ...p, end: e.target.value }))}
                className="w-full min-w-0 appearance-none bg-white/5 border border-white/10 rounded-full px-3 sm:px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />

            </div>
            {dateError && <div className="text-[11px] text-pink-300/90">{dateError}</div>}

            <button
              type="button"
              onClick={create}
              disabled={!canCreate}
              className="w-full px-4 py-2 rounded-full bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Creating…" : "Create"}
            </button>

            <div className="text-[11px] text-white/45">Creates a trip plan card inside this chat.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
