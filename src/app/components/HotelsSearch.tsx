"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function HotelsSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [countries, setCountries] = useState<string[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [filteredCities, setFilteredCities] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

    const isValidCountry = useMemo(
    () => countries.includes(country),
    [countries, country]
  );

  const isValidCity = useMemo(
    () => cities.includes(city),
    [cities, city]
  );

  useEffect(() => {
    if (!open) {
      setCountry("");
      setCity("");
      setCheckIn("");
      setCheckOut("");
      setAdults(2);
      setFilteredCountries([]);
      setFilteredCities([]);
    }
  }, [open]);

  // Load countries
  useEffect(() => {
    fetch("/data/cities.json")
      .then((res) => res.json())
      .then((data) => setCountries(Object.keys(data)))
      .catch(() => setCountries([]));
  }, []);

  // Fetch cities when country changes
  useEffect(() => {
    if (!country) return;
    fetch(`/api/cities?country=${encodeURIComponent(country)}`)
      .then((res) => res.json())
      .then((data) => setCities(data.cities || []))
      .catch(() => setCities([]));
  }, [country]);

  const dateError = useMemo(() => {
    if (!checkIn || !checkOut) return "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);

    if (inDate < today) return "Check-in cannot be in the past.";
    if (outDate <= inDate) return "Check-out must be after check-in.";

    return "";
  }, [checkIn, checkOut]);

  const canSubmit = useMemo(() => {
    return (
      isValidCountry &&
      isValidCity &&
      !!checkIn &&
      !!checkOut &&
      !dateError &&
      !submitting
    );
  }, [isValidCountry, isValidCity, checkIn, checkOut, dateError, submitting]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed z-[70] left-1/2 top-[92px] -translate-x-1/2 w-[min(92vw,600px)]
        rounded-2xl border border-white/15 bg-white/10 dark:bg-zinc-900/60
        backdrop-blur-2xl shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Find Hotels</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition"
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="space-y-3 relative">
          {/* Country Input */}
          <div className="relative">
            <input
              type="text"
              value={country}
              onChange={(e) => {
                const val = e.target.value;
                setCountry(val);
                setShowCountryDropdown(true);
                const matches = countries.filter((c) =>
                  c.toLowerCase().includes(val.toLowerCase())
                );
                setFilteredCountries(matches);
                if (!countries.includes(val)) {
                  setCity("");
                  setCities([]);
                }
              }}
              onFocus={() => setShowCountryDropdown(true)}
              onBlur={() => setTimeout(() => setShowCountryDropdown(false), 150)}
              placeholder="Country"
              className="w-full rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/60 py-3 px-4 focus:ring-2 focus:ring-pink-400 outline-none"
            />
                        {country && !isValidCountry && (
              <p className="text-[11px] text-amber-300 mt-1">
                Please select a country from the list.
              </p>
            )}
            {showCountryDropdown && filteredCountries.length > 0 && (
              <ul
                className="
                  absolute left-0 right-0 z-[80] mt-2 max-h-48 overflow-y-auto
                  rounded-xl shadow-lg overflow-hidden
                  bg-white/95 border border-zinc-200 text-zinc-900
                  dark:bg-black/70 dark:border-white/10 dark:text-white
                  backdrop-blur-md
                "
              >              
                {filteredCountries.map((c) => (
                  <li
                    key={c}
                    onClick={() => {
                      setCountry(c);
                      setShowCountryDropdown(false);
                    }}
                    className="px-4 py-2 hover:bg-pink-500/40 cursor-pointer transition"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* City Input */}
          <div className="relative">
            <input
              type="text"
              value={city}
              onChange={(e) => {
                const val = e.target.value;
                setCity(val);
                setShowCityDropdown(true);
                setFilteredCities(
                  cities.filter((ct) =>
                    ct.toLowerCase().includes(val.toLowerCase())
                  )
                );
              }}
              onFocus={() => setShowCityDropdown(true)}
              onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
              placeholder="City"
              disabled={!isValidCountry}
              className="w-full rounded-xl bg-white/10 border border-white/15 text-white placeholder-white/60 py-3 px-4 focus:ring-2 focus:ring-pink-400 outline-none disabled:opacity-40"
            />
            {city && !isValidCity && (
              <p className="text-[11px] text-amber-300 mt-1">
                Please select a city from the list.
              </p>
            )}
            {showCityDropdown && filteredCities.length > 0 && (
              <ul
                className="
                  absolute left-0 right-0 z-[90] mt-2 max-h-48 overflow-y-auto
                  rounded-xl shadow-lg overflow-hidden
                  bg-white/95 border border-zinc-200 text-zinc-900
                  dark:bg-black/70 dark:border-white/10 dark:text-white
                  backdrop-blur-md
                "
              >
                {filteredCities.map((c, i) => (
                  <li
                    key={`${c}-${i}`}
                    onClick={() => {
                      setCity(c);
                      setShowCityDropdown(false);
                    }}
                    className="px-4 py-2 hover:bg-pink-500/40 cursor-pointer transition"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-white/70 mb-1">Check-in</label>
              <input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={checkIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (checkOut && e.target.value > checkOut) setCheckOut("");
                }}
                className="w-full bg-white/10 border border-white/15 rounded-xl text-white px-3 py-2 focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/70 mb-1">Check-out</label>
              <input
                type="date"
                min={checkIn || new Date().toISOString().split("T")[0]}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full bg-white/10 border border-white/15 rounded-xl text-white px-3 py-2 focus:ring-2 focus:ring-pink-400 outline-none"
              />
            </div>
          </div>

          {/* Guests */}
          <div>
            <label className="block text-[11px] text-white/70 mb-1">Guests</label>
            <input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(parseInt(e.target.value || "1"))}
              className="w-full bg-white/10 border border-white/15 rounded-xl text-white px-3 py-2 focus:ring-2 focus:ring-pink-400 outline-none"
            />
          </div>

            {/* Submit */}
            <button
              disabled={!canSubmit}
              onClick={() => {
                if (!canSubmit) return;
                setSubmitting(true);

                const q = new URLSearchParams({
                  country,
                  city,
                  checkIn,
                  checkOut,
                  adults: String(adults),
                });

                router.push(`/hotels/results?${q.toString()}`);
                onClose();
              }}
              className="
                w-full mt-4 rounded-xl py-3 font-semibold
                transition-all
                disabled:cursor-not-allowed disabled:opacity-70
                bg-gradient-to-r from-pink-500 to-pink-600
                hover:from-pink-400 hover:to-pink-600
                shadow-md hover:shadow-lg
                text-white
              "
            >
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 flex items-center justify-center">
                  {submitting && <Loader2 className="animate-spin" size={16} />}
                </span>
                <span className="leading-none">
                  {submitting ? "Searching hotels…" : "Find Hotels"}
                </span>
              </span>
            </button>

          {dateError && (
            <p className="text-[12px] text-amber-300 mt-1">{dateError}</p>
          )}
        </div>
      </div>
    </>
  );
}