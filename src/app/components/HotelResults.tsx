"use client";

import { useEffect, useState, useContext } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2, Star } from "lucide-react";
import { FilterContext } from "@/app/layout";

type Hotel = {
  name: string;
  rating?: number | null;
  reviews?: number | null;
  price?: string | number | null;
  total?: string | number | null;
  thumbnail?: string | null;
  address?: string | null;
  amenities?: string[];
  link?: string | null;
};

const KNOWN_AMENITIES = [
  "Free Wi-Fi",
  "Air conditioning",
  "Restaurant",
  "Parking",
  "Breakfast",
  "Pool",
  "Bar",
  "Kitchen",
  "Pet-friendly",
  "Gym",
  "Accessible",
  "Smoke-free property",
];

export default function HotelResults() {
  const sp = useSearchParams();
  const { showFilters } = useContext(FilterContext);

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filteredHotels, setFilteredHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFallbackImage, setCityFallbackImage] = useState<string>("/fallbacks/landscape.jpg");
  const [filtersDismissed, setFiltersDismissed] = useState(false);

  const city = sp.get("city") || "";
  const checkIn = sp.get("checkIn") || "";
  const checkOut = sp.get("checkOut") || "";
  const adults = sp.get("adults") || "2";

  const [minRating, setMinRating] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  useEffect(() => {
    if (!city || !checkIn || !checkOut) return;

    const fetchHotels = async () => {
      setLoading(true);
      try {
        const cityImgRes = await fetch(`/api/hotelImages?city=${encodeURIComponent(city)}`);
        const cityImgData = await cityImgRes.json();
        setCityFallbackImage(cityImgData.urls?.[0] || "/fallbacks/landscape.jpg");

        const res = await fetch("/api/hotels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city,
            checkIn,
            checkOut,
            adults: Number(adults),
            currency: "GBP",
          }),
        });

        const data = await res.json();
        setHotels(data.hotels || []);
        setFilteredHotels(data.hotels || []);
      } catch (err) {
        console.error("HotelResults fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHotels();
  }, [city, checkIn, checkOut, adults]);

  useEffect(() => {
    let filtered = [...hotels];

    if (minRating) {
      filtered = filtered.filter((h) => (h.rating ?? 0) >= minRating);
    }

    if (maxPrice) {
      filtered = filtered.filter((h) => {
        const price =
          typeof h.price === "string"
            ? parseFloat(h.price.replace(/[£,]/g, ""))
            : h.price ?? 0;
        return price <= maxPrice;
      });
    }

    if (selectedAmenities.length > 0) {
      filtered = filtered.filter((h) =>
        selectedAmenities.every((a) =>
          h.amenities?.some((ha) => ha.toLowerCase().includes(a.toLowerCase()))
        )
      );
    }

    setFilteredHotels(filtered);
  }, [minRating, maxPrice, selectedAmenities, hotels]);

  useEffect(() => {
    if (!showFilters) {
      setFiltersDismissed(false);
    }
  }, [showFilters]);

  const toggleAmenity = (a: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  };

  const clearAllFilters = () => {
    setMinRating(null);
    setMaxPrice(null);
    setSelectedAmenities([]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    filteredHotels.forEach((h) => {
      if (h.thumbnail?.startsWith("http")) {
        const img = new window.Image();
        img.referrerPolicy = "no-referrer";
        img.src = h.thumbnail;
      }
    });
  }, [filteredHotels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <Loader2 className="animate-spin mr-2" /> Searching stays...
      </div>
    );
  }

  const filtersVisible = showFilters && !filtersDismissed;

  return (
    <main className="min-h-screen scrollbar-hide w-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-gray-100 overflow-y-auto">
      {filtersVisible && (
        <div className="fixed top-[70px] left-0 w-full z-40 bg-black/70 backdrop-blur-lg border-b border-white/10 px-4 sm:px-8 py-4 animate-fade-in-down">
          <div className="max-w-7xl mx-auto flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-white/90">Filters</h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-3 py-1.5 text-xs rounded-full border border-white/15 text-white/80 hover:bg-white/10 transition"
                >
                  Clear all
                </button>

                <button
                  type="button"
                  onClick={() => setFiltersDismissed(true)}
                  className="px-3 py-1.5 text-xs rounded-full border border-white/15 text-white/80 hover:bg-white/10 transition"
                >
                  Hide filters
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 justify-center">
              <select
                value={minRating ?? ""}
                onChange={(e) =>
                  setMinRating(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-zinc-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-600/50"
              >
                <option value="">Min Rating</option>
                {[1, 2, 3, 4, 4.5].map((r) => (
                  <option key={r} value={r}>
                    {r}★
                  </option>
                ))}
              </select>

              <select
                value={maxPrice ?? ""}
                onChange={(e) =>
                  setMaxPrice(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-zinc-900 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-600/50"
              >
                <option value="">Max Price (£)</option>
                {[50, 100, 150, 200].map((p) => (
                  <option key={p} value={p}>
                    £{p}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2 justify-center">
                {KNOWN_AMENITIES.map((a) => (
                  <button
                    key={a}
                    onClick={() => toggleAmenity(a)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                      selectedAmenities.includes(a)
                        ? "bg-pink-500 border-pink-400 text-white"
                        : "border-gray-600 text-gray-300 hover:bg-pink-500/20"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-24 space-y-8">
        {filteredHotels.length === 0 ? (
          <p className="text-center text-gray-400">
            No hotels match your filters.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredHotels.map((h, i) => (
              <div
                key={`${h.name}-${i}`}
                className="rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 overflow-hidden hover:border-pink-400/40 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300"
              >
                <div className="relative w-full aspect-[16/9] bg-white/5 overflow-hidden">
                  {!h.thumbnail && (
                    <div className="absolute inset-0 bg-gray-800/50 animate-pulse" />
                  )}

                  <Image
                    key={h.thumbnail || `${cityFallbackImage}-${i}`}
                    src={
                      h.thumbnail?.startsWith("http")
                        ? h.thumbnail
                        : cityFallbackImage
                    }
                    alt={h.name}
                    fill
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="object-cover opacity-0 transition-opacity duration-700"
                    onLoadingComplete={(img) => img.classList.remove("opacity-0")}
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = cityFallbackImage;
                    }}
                  />
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">{h.name}</h3>
                      {!!h.amenities?.length && (
                        <p className="mt-1 text-xs text-white/50 line-clamp-1">
                          {h.amenities.slice(0, 4).join(" • ")}
                        </p>
                      )}
                    </div>

                    {h.rating && (
                      <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
                        <Star size={14} className="text-amber-300" />
                        <span className="text-sm">{h.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-white">
                      {h.price ? (
                        <span className="text-lg font-bold">{h.price}</span>
                      ) : (
                        <span className="text-white/60">Price unavailable</span>
                      )}
                      <span className="text-xs text-white/50 ml-1">/night</span>
                    </div>

                    {h.link && (
                      <a
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium shadow-md"
                      >
                        View deal →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}