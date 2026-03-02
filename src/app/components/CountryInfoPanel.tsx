"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { X, Loader2, Plane, Bed } from "lucide-react";
import { useRouter } from "next/navigation";

type Airport = {
  name: string;
  city: string;
  country: string;
  iata_code: string;
};

type Props = {
  selected: string | null;
  onClose: () => void;
  preloadedImages?: string[];
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

const imageCache = new Map<string, string[]>();
const defaultImages = ["/logo.png"];

export default function CountryInfoPanel({
  selected,
  onClose,
  preloadedImages,
  expanded = false,
  onToggleExpanded,
}: Props) {

  const [images, setImages] = useState<string[]>(preloadedImages ?? defaultImages);
  const [mainImage, setMainImage] = useState<string | null>(preloadedImages?.[0] ?? defaultImages[0]);
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  //Airports
  const [airports, setAirports] = useState<Airport[]>([]);
  const [filteredAirports, setFilteredAirports] = useState<Airport[]>([]);
  const [showAirportDropdown, setShowAirportDropdown] = useState(false);

  //Cities
  const [cities, setCities] = useState<string[]>([]);
  const [filteredCities, setFilteredCities] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState("");

  //Form state
  const [tripType, setTripType] = useState<"oneway" | "return">("oneway");
  const [departAirport, setDepartAirport] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [mode, setMode] = useState<"flights" | "hotels">("flights");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const isValidCity = cities.includes(selectedCity);

  const originAirport = airports.find(
    (a) =>
      a.iata_code.toLowerCase() === departAirport.toLowerCase() ||
      `${a.city} (${a.iata_code})`.toLowerCase() === departAirport.toLowerCase()
  );

const todayStr = new Date().toISOString().split("T")[0];

const dateError =
  mode === "flights"
    ? !departDate
      ? ""
      : tripType === "return" && returnDate && returnDate <= departDate
      ? "Return date must be after departure."
      : ""
    : !checkIn || !checkOut
    ? ""
    : checkOut <= checkIn
    ? "Check-out must be after check-in."
    : "";
  
    const canSubmit =
      mode === "flights"
        ? !!originAirport &&
          !!departDate &&
          (tripType === "oneway" || !!returnDate) &&
          !dateError &&
          !submitting
        : isValidCity &&
          !!checkIn &&
          !!checkOut &&
          !dateError &&
          !submitting;

  useEffect(() => {
    setSubmitting(false);
  }, [mode, selected]);

  //Load airports + cities
  useEffect(() => {
    fetch("/data/airports.json")
      .then((res) => res.json())
      .then((data) => setAirports(Array.isArray(data) ? data : data.airports ?? []))
      .catch(() => setAirports([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/cities?country=${encodeURIComponent(selected)}`)
      .then((res) => res.json())
      .then((data) => setCities(data.cities || []))
      .catch(() => setCities([]));
  }, [selected]);

  //Country images
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setImages(defaultImages);
    setMainImage(defaultImages[0]);

    if (preloadedImages?.length) {
      setImages(preloadedImages);
      setMainImage(preloadedImages[0]);
      setLoading(false);
      return;
    }

    if (imageCache.has(selected)) {
      const cached = imageCache.get(selected)!;
      setImages(cached);
      setMainImage(cached[0]);
      setLoading(false);
      return;
    }

    fetch(`/api/countryImages?name=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d) => {
        const urls = d.urls?.length ? d.urls : defaultImages;
        imageCache.set(selected, urls);
        setImages(urls);
        setMainImage(urls[0]);
      })
      .catch(() => {
        setImages(defaultImages);
        setMainImage(defaultImages[0]);
      })
      .finally(() => setLoading(false));
  }, [selected]);

  //Airport filtering
  const handleAirportSearch = (value: string) => {
    setDepartAirport(value);
    if (!value.trim()) {
      setFilteredAirports([]);
      return;
    }
    const filtered = airports.filter(
      (a) =>
        a.name.toLowerCase().includes(value.toLowerCase()) ||
        a.city.toLowerCase().includes(value.toLowerCase()) ||
        a.iata_code.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredAirports(filtered.slice(0, 8));
  };

  const handleDateChange = (type: "depart" | "return", value: string) => {
    if (type === "depart") {
      setDepartDate(value);
      if (returnDate && value > returnDate) setReturnDate("");
    } else {
      if (!departDate || value >= departDate) setReturnDate(value);
    }
  };

  const handleCitySearch = (value: string) => {
    setSelectedCity(value);
    if (!value.trim()) {
      setFilteredCities([]);
      return;
    }
    const filtered = cities.filter((c) => c.toLowerCase().includes(value.toLowerCase()));
    setFilteredCities(filtered.slice(0, 8));
  };

  //Continue buttons
  const handleContinueFlights = () => {
    if (submitting) return;
    setSubmitting(true);

    const selectedAirport = airports.find(
      (a) =>
        a.iata_code.toLowerCase() === departAirport.toLowerCase() ||
        `${a.city} (${a.iata_code})`.toLowerCase() === departAirport.toLowerCase() ||
        a.name.toLowerCase() === departAirport.toLowerCase()
    );

    if (!selectedAirport) {
      alert("Please select a valid departure airport.");
      setSubmitting(false);
      return;
    }
    if (!departDate) {
      alert("Please select a departure date.");
      setSubmitting(false);
      return;
    }
    if (tripType === "return" && !returnDate) {
      alert("Please select a valid return date.");
      setSubmitting(false);
      return;
    }

    const params = new URLSearchParams({
      tripType,
      depart: selectedAirport.iata_code,
      departDate,
      ...(tripType === "return" && { returnDate }),
    });

    router.push(`/airports/${encodeURIComponent(selected!)}?${params.toString()}`);
  };

  const handleContinueHotels = () => {
    if (submitting) return;
    setSubmitting(true);

    if (!selectedCity) {
      alert("Please select a city.");
      setSubmitting(false);
      return;
    }
    if (!checkIn || !checkOut) {
      alert("Please select valid check-in and check-out dates.");
      setSubmitting(false);
      return;
    }
    const params = new URLSearchParams({
      country: selected!,
      city: selectedCity,
      checkIn,
      checkOut,
      guests: guests.toString(),
    });
    router.push(`/hotels/results?${params.toString()}`);
  };

  return (
    <AnimatePresence>
      {selected && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm md:hidden z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSubmitting(false);
              onClose();
            }}
          />

          <motion.div
            key={selected}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 90, damping: 14 }}
            className={[
              "fixed right-0 z-50 w-full",
              "top-10 bottom-[var(--bottom-nav-h)]",
              "lg:top-[var(--nav-h)] lg:bottom-[var(--bottom-nav-h)]",
              expanded ? "lg:w-[min(960px,100vw)]" : "sm:w-[440px]",
              "backdrop-blur-3xl bg-gradient-to-b from-white/10 to-black/40 dark:from-zinc-900/70 dark:to-black/60",
              "border-l border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.4)]",
              "overflow-y-auto",
            ].join(" ")}
          >
            <div className="relative h-full flex flex-col">
              <button
                onClick={() => {
                  setSubmitting(false);
                  onClose();
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/20 dark:bg-zinc-800/60 hover:bg-white/30 transition z-10"
              >
                <X size={20} className="text-white" />
              </button>

              {/* Hero image */}
              <div className="relative w-full h-64 bg-zinc-200 dark:bg-zinc-800">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <Loader2 className="animate-spin mr-2" /> Loading...
                  </div>
                ) : (
                  mainImage && (
                    <Image
                      key={mainImage}
                      src={mainImage}
                      alt={`${selected} hero`}
                      fill
                      priority
                      className="object-cover transition-opacity duration-300"
                    />
                  )
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <h2 className="absolute bottom-3 left-4 text-2xl font-semibold text-white drop-shadow-md">
                  {selected}
                </h2>
              </div>
              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="p-4 flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                  {images.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setMainImage(src)}
                      className="relative flex-shrink-0 w-[220px] aspect-[16/9] rounded-xl overflow-hidden snap-start"
                    >
                      <Image
                        src={src}
                        alt={`${selected} view ${i + 1}`}
                        fill
                        loading="lazy"
                        className={`object-cover shadow-sm transition-all duration-200 ${
                          mainImage === src
                            ? "ring-4 ring-sky-500 scale-[1.02]"
                            : "hover:opacity-90"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Main content */}
              <div className="p-4 space-y-3">
                {/* Mode toggle */}
                <div className="flex justify-center gap-2 mb-2">
                  <button
                    disabled={submitting}
                    onClick={() => setMode("flights")}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                      mode === "flights"
                        ? "bg-sky-600 text-white shadow-md "
                        : "bg-transparent border border-sky-400/50 text-sky-400 hover:bg-sky-500/10"
                    } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Plane size={14} /> Flights
                  </button>
                  <button
                    disabled={submitting}
                    onClick={() => setMode("hotels")}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                      mode === "hotels"
                        ? "bg-pink-600 text-white shadow-md "
                        : "bg-transparent border border-pink-400/50 text-pink-400 hover:bg-pink-500/10"
                    } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Bed size={14} /> Hotels
                  </button>
                </div>

                {mode === "flights" && (
                  <>
                    {/* Trip Type */}
                    <div className="flex justify-center gap-2 mb-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setTripType("oneway")}
                        className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                          tripType === "oneway"
                            ? "bg-sky-500 text-white shadow-md"
                            : "bg-transparent border border-sky-400/50 text-sky-400 hover:bg-sky-500/10"
                        } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        One Way
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setTripType("return")}
                        className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                          tripType === "return"
                            ? "bg-sky-500 text-white shadow-md"
                            : "bg-transparent border border-sky-400/50 text-sky-400 hover:bg-sky-500/10"
                        } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        Return
                      </button>
                    </div>

                    <div className="relative">
                      <label className="text-xs text-gray-300 mb-1 block">Departure Airport</label>
                      <div className="glass flex items-center px-4 py-2 rounded-2xl shadow-md focus-within:ring-2 focus-within:ring-sky-400 transition-all">
                        <input
                          type="text"
                          placeholder="Search airport..."
                          value={departAirport}
                          onChange={(e) => handleAirportSearch(e.target.value)}
                          onFocus={() => setShowAirportDropdown(true)}
                          onBlur={() => setTimeout(() => setShowAirportDropdown(false), 200)}
                          disabled={submitting}
                          className="w-full bg-transparent text-gray-100 placeholder-gray-400 focus:outline-none text-sm disabled:opacity-60"
                        />
                      </div>

                      {departAirport && !originAirport && (
                        <p className="text-[11px] text-amber-300 mt-1">
                          Please select a valid airport.
                        </p>
                      )}

                      {showAirportDropdown && filteredAirports.length > 0 && (
                        <ul
                          className="
                            absolute left-0 right-0 mt-2 z-[9999]
                            max-h-56 overflow-y-auto scrollbar-hide
                            rounded-xl shadow-xl overflow-hidden
                            bg-white/95 border border-zinc-200 text-zinc-900
                            dark:bg-zinc-900/85 dark:border-white/10 dark:text-zinc-100
                            backdrop-blur-xl
                          "
                        >
                          {filteredAirports.map((a) => (
                            <li
                              key={a.iata_code}
                              onClick={() => {
                                if (submitting) return;
                                setDepartAirport(`${a.city} (${a.iata_code})`);
                                setShowAirportDropdown(false);
                              }}
                              className="px-4 py-2 cursor-pointer hover:bg-sky-100/70 dark:hover:bg-zinc-700/70 transition text-sm text-gray-800 dark:text-gray-100 flex justify-between"
                            >
                              <span>
                                {a.city} — {a.name}
                              </span>
                              <span className="text-xs text-sky-400 font-mono">{a.iata_code}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-[20px]">
                      <div>
                        <label className="text-xs text-gray-300 mb-1 block">Departure Date</label>
                        <input
                          type="date"
                          min={todayStr}
                          value={departDate}
                          onChange={(e) => {
                            setDepartDate(e.target.value);
                            if (tripType === "return" && returnDate && returnDate <= e.target.value) {
                              setReturnDate("");
                            }
                          }}
                          disabled={submitting}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-gray-500/30 text-gray-100 text-sm focus:ring-2 focus:ring-sky-400 outline-none disabled:opacity-60"
                        />
                      </div>
                      {tripType === "return" && (
                        <div>
                          <label className="text-xs text-gray-300 mb-1 block">Return Date</label>
                          <input
                            type="date"
                            min={departDate || todayStr}
                            value={returnDate}
                            onChange={(e) => setReturnDate(e.target.value)}
                            disabled={submitting || !departDate}
                            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-gray-500/30 text-gray-100 text-sm focus:ring-2 focus:ring-sky-400 outline-none disabled:opacity-60"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleContinueFlights}
                      disabled={submitting}
                      className="
                        w-full rounded-xl py-3 font-semibold
                        transition-all mt-2
                        disabled:cursor-not-allowed
                        bg-gradient-to-r from-sky-500 to-sky-600
                        hover:from-sky-400 hover:to-sky-600
                        shadow-md hover:shadow-lg
                        disabled:opacity-70
                      "
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 flex items-center justify-center">
                          {submitting && <Loader2 className="animate-spin" size={16} />}
                        </span>

                        <span className="leading-none">
                          {submitting ? "Loading airports…" : `Search airports in ${selected}`}
                        </span>
                      </span>
                    </button>
                  </>
                )}

                {mode === "hotels" && (
                  <>
                    <div className="relative">
                      <label className="text-xs text-gray-300 mb-1 block">City</label>
                      <div className="glass flex items-center px-4 py-2 rounded-2xl shadow-md focus-within:ring-2 focus-within:ring-pink-400 transition-all">
                        <input
                          type="text"
                          placeholder="Search city..."
                          value={selectedCity}
                          onChange={(e) => handleCitySearch(e.target.value)}
                          onFocus={() => setShowCityDropdown(true)}
                          onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
                          disabled={submitting}
                          className="w-full bg-transparent text-gray-100 placeholder-gray-400 focus:outline-none text-sm disabled:opacity-60"
                        />
                      </div>

                      {selectedCity && !isValidCity && (
                      <p className="text-[11px] text-amber-300 mt-1">
                        Please select a city from the list.
                      </p>
                    )}

                      {showCityDropdown && filteredCities.length > 0 && (
                        <ul
                          className="
                            absolute left-0 right-0 mt-2 z-[9999]
                            max-h-56 overflow-y-auto scrollbar-hide
                            rounded-xl shadow-xl overflow-hidden
                            bg-white/95 border border-zinc-200 text-zinc-900
                            dark:bg-zinc-900/85 dark:border-white/10 dark:text-zinc-100
                            backdrop-blur-xl
                          "
                        >
                          {filteredCities.map((city, idx) => (
                            <li
                              key={`${city}-${idx}`}
                              onClick={() => {
                                if (!canSubmit) return;
                                setSelectedCity(city);
                                setShowCityDropdown(false);
                              }}
                              className="px-4 py-2 cursor-pointer hover:bg-pink-100/70 dark:hover:bg-zinc-700/70 transition text-sm text-gray-800 dark:text-gray-100"
                            >
                              {city}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Dates + guests */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-[20px]">
                        <div>
                        <label className="text-xs text-gray-300 mb-1 block">Check-in</label>
                        <input
                          type="date"
                          min={todayStr}
                          value={checkIn}
                          onChange={(e) => setCheckIn(e.target.value)}
                          disabled={submitting}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-gray-500/30 text-gray-100 text-sm focus:ring-2 focus:ring-pink-400 outline-none disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-300 mb-1 block">Check-out</label>
                        <input
                          type="date"
                          min={checkIn || todayStr}
                          value={checkOut}
                          onChange={(e) => setCheckOut(e.target.value)}
                          disabled={submitting}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-gray-500/30 text-gray-100 text-sm focus:ring-2 focus:ring-pink-400 outline-none disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-300 mb-1 block">Guests</label>
                      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/10 border border-gray-500/30">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setGuests(Math.max(1, guests - 1))}
                          className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white text-base disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          −
                        </button>

                        <span className="text-gray-100 text-sm font-medium">
                          {guests}
                        </span>

                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setGuests(guests + 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white text-base disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleContinueHotels}
                      disabled={submitting}
                      className="
                        w-full rounded-xl py-3 font-semibold
                        transition-all mt-2
                        disabled:cursor-not-allowed
                        bg-gradient-to-r from-pink-500 to-pink-600
                        hover:from-pink-400 hover:to-pink-600
                        shadow-md hover:shadow-lg
                        disabled:opacity-70
                      "
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 flex items-center justify-center">
                          {submitting && <Loader2 className="animate-spin" size={16} />}
                        </span>
                        <span className="leading-none">
                          {submitting ? "Searching hotels…" : `Find Hotels in ${selected}`}
                        </span>
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
