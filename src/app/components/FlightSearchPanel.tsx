"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

type Airport = {
  name: string;
  city: string;
  country: string;
  iata_code: string;
};

export default function FlightSearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [tripType, setTripType] = useState<"oneway" | "return">("oneway");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [filteredFrom, setFilteredFrom] = useState<Airport[]>([]);
  const [filteredTo, setFilteredTo] = useState<Airport[]>([]);
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);

  useEffect(() => {
    fetch("/data/airports.json")
      .then((r) => r.json())
      .then((data) => setAirports(data || []))
      .catch(() => setAirports([]));
  }, []);

  const filterAirports = (val: string, setFiltered: any) => {
    if (!val.trim()) return setFiltered([]);
    const res = airports.filter(
      (a) =>
        a.name.toLowerCase().includes(val.toLowerCase()) ||
        a.city.toLowerCase().includes(val.toLowerCase()) ||
        a.iata_code.toLowerCase().includes(val.toLowerCase())
    );
    setFiltered(res.slice(0, 8));
  };

  const origin = useMemo(() => {
    const v = from.trim().toLowerCase();
    if (!v) return null;
    return (
      airports.find((a) => a.iata_code.toLowerCase() === v) ||
      airports.find((a) => `${a.city} (${a.iata_code})`.toLowerCase() === v) ||
      null
    );
  }, [airports, from]);

  const destination = useMemo(() => {
    const v = to.trim().toLowerCase();
    if (!v) return null;
    return (
      airports.find((a) => a.iata_code.toLowerCase() === v) ||
      airports.find((a) => `${a.city} (${a.iata_code})`.toLowerCase() === v) ||
      null
    );
  }, [airports, to]);

  const dateError = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!departDate) return "";

    const d = new Date(departDate);
    if (d < today) return "Depart date cannot be in the past.";

    if (tripType === "return") {
      if (!returnDate) return "";
      const r = new Date(returnDate);
      if (r <= d) return "Return date must be after depart date.";
    }

    return "";
  }, [departDate, returnDate, tripType]);

  const canSearch = useMemo(() => {
    if (!origin || !destination) return false;
    if (origin.iata_code === destination.iata_code) return false;
    if (!departDate) return false;
    if (tripType === "return" && !returnDate) return false;
    if (dateError) return false;
    return true;
  }, [origin, destination, departDate, returnDate, tripType, dateError]);

  const handleSearch = () => {
    if (!canSearch || !origin || !destination) return;

    const params = new URLSearchParams({
      origin: origin.iata_code,
      destination: destination.iata_code,
      departDate,
      tripType,
      ...(tripType === "return" && { returnDate }),
    });

    router.push(`/flights/results?${params.toString()}`);
    onClose();
  };

  const todayStr = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  
  const DROPDOWN_UL =
  "absolute left-0 right-0 mt-2 z-50 max-h-56 overflow-y-auto scrollbar-hide " +
  "rounded-xl shadow-xl overflow-hidden " +
  "bg-white/95 border border-zinc-200 text-zinc-900 " +
  "dark:bg-zinc-900/85 dark:border-white/10 dark:text-zinc-100 " +
  "backdrop-blur-xl";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex flex-col items-center justify-start pt-[90px]"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ type: "spring", stiffness: 90, damping: 14 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[90%] sm:w-[800px] rounded-3xl p-6 glass bg-white/10 dark:bg-zinc-900/70 border border-white/20 backdrop-blur-2xl shadow-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X size={20} />
          </button>

          <h2 className="text-2xl font-semibold text-white mb-4 text-center">
            Search Flights
          </h2>

          <div className="flex justify-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => {
                setTripType("oneway");
                setReturnDate("");
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                tripType === "oneway"
                  ? "bg-sky-500 text-white"
                  : "border border-sky-400/50 text-sky-400 hover:bg-sky-500/10"
              }`}
            >
              One Way
            </button>
            <button
              type="button"
              onClick={() => setTripType("return")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                tripType === "return"
                  ? "bg-sky-500 text-white"
                  : "border border-sky-400/50 text-sky-400 hover:bg-sky-500/10"
              }`}
            >
              Return
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="relative">
              <label className="text-xs text-gray-300 mb-1 block">From</label>
              <input
                value={from}
                onChange={(e) => {
                  const v = e.target.value;
                  setFrom(v);
                  filterAirports(v, setFilteredFrom);
                }}
                onFocus={() => setShowFrom(true)}
                onBlur={() => setTimeout(() => setShowFrom(false), 200)}
                placeholder="City or Airport"
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-gray-400/30 text-gray-100 text-sm focus:ring-2 focus:ring-sky-400 outline-none"
              />
              {showFrom && filteredFrom.length > 0 && (
                <ul className={DROPDOWN_UL}>
                  {filteredFrom.map((a) => (
                    <li
                      key={a.iata_code}
                      onClick={() => {
                        setFrom(`${a.city} (${a.iata_code})`);
                        setShowFrom(false);
                      }}
                      className="px-4 py-2 cursor-pointer hover:bg-sky-100/70 dark:hover:bg-zinc-700/70 transition text-sm text-gray-800 dark:text-gray-100 flex justify-between"
                    >
                      <span>
                        {a.city} — {a.name}
                      </span>
                      <span className="text-xs text-sky-400 font-mono">
                        {a.iata_code}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {from && !origin && (
                <p className="text-[11px] text-amber-300 mt-1">
                  Please select an airport from the list.
                </p>
              )}
            </div>

            <div className="relative">
              <label className="text-xs text-gray-300 mb-1 block">To</label>
              <input
                value={to}
                onChange={(e) => {
                  const v = e.target.value;
                  setTo(v);
                  filterAirports(v, setFilteredTo);
                }}
                onFocus={() => setShowTo(true)}
                onBlur={() => setTimeout(() => setShowTo(false), 200)}
                placeholder="City or Airport"
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-gray-400/30 text-gray-100 text-sm focus:ring-2 focus:ring-sky-400 outline-none"
              />
              {showTo && filteredTo.length > 0 && (
                <ul className={DROPDOWN_UL}>
                    {filteredTo.map((a) => (
                    <li
                      key={a.iata_code}
                      onClick={() => {
                        setTo(`${a.city} (${a.iata_code})`);
                        setShowTo(false);
                      }}
                      className="px-4 py-2 cursor-pointer hover:bg-sky-100/70 dark:hover:bg-zinc-700/70 transition text-sm text-gray-800 dark:text-gray-100 flex justify-between"
                    >
                      <span>
                        {a.city} — {a.name}
                      </span>
                      <span className="text-xs text-sky-400 font-mono">
                        {a.iata_code}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {to && !destination && (
                <p className="text-[11px] text-amber-300 mt-1">
                  Please select an airport from the list.
                </p>
              )}
              {origin && destination && origin.iata_code === destination.iata_code && (
                <p className="text-[11px] text-amber-300 mt-1">
                  Origin and destination must be different.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-300 mb-1 block">Depart</label>
              <input
                type="date"
                min={todayStr}
                value={departDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setDepartDate(v);
                  if (tripType === "return" && returnDate && v && returnDate <= v) {
                    setReturnDate("");
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-gray-500/30 text-gray-100 text-sm focus:ring-2 focus:ring-sky-400 outline-none"
              />
            </div>
            {tripType === "return" && (
              <div>
                <label className="text-xs text-gray-300 mb-1 block">Return</label>
                <input
                  type="date"
                  min={departDate || todayStr}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-gray-500/30 text-gray-100 text-sm focus:ring-2 focus:ring-sky-400 outline-none"
                />
              </div>
            )}
          </div>

          {dateError && <p className="text-[12px] text-amber-300 mb-3">{dateError}</p>}

          <button
            type="button"
            onClick={handleSearch}
            disabled={!canSearch}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-xl py-3 font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
          >
            Search Flights
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
