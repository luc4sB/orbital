"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

type Airport = {
  country: string;
  city: string;
  name: string;
  iata_code: string;
  image?: string;
};

export default function Airports({ country }: { country: string }) {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const tripType = searchParams.get("tripType") || "oneway";
  const depart = searchParams.get("depart") || "";
  const departDate = searchParams.get("departDate") || "";
  const returnDate = searchParams.get("returnDate") || "";

  useEffect(() => {
    if (!country) return;

    const fetchAirports = async () => {
      try {
        const res = await fetch(`/api/airports?country=${encodeURIComponent(country)}`);
        const data = await res.json();

        const airportList: Airport[] = (data.airports ?? []) as Airport[];

        const uniqueAirports: Airport[] = Array.from(
          new Map(airportList.map((a) => [a.iata_code, a])).values()
        );

        const enriched: Airport[] = await Promise.all(
          uniqueAirports.map(async (a) => {
            const cityQuery = a.city?.split(" ")[0] || country;
            try {
              const imgRes = await fetch(`/api/airportImage?query=${encodeURIComponent(cityQuery)}`);
              const imgData = await imgRes.json();
              return {
                ...a,
                image: imgData?.image || "/fallbacks/landscape.jpg",
              };
            } catch {
              return { ...a, image: "/fallbacks/landscape.jpg" };
            }
          })
        );

        setAirports(enriched);
      } catch (err) {
        console.error("Failed to fetch airports:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAirports();
  }, [country]);

  const goToDeals = (iataCode: string) => {
    const params = new URLSearchParams({
      origin: depart,
      destination: iataCode,
      departDate,
      ...(tripType === "return" && { returnDate }),
      tripType,
      ...(depart && { depart }),
    });

    router.push(`/flights/results?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-500 dark:text-gray-300">
        <Loader2 className="animate-spin mb-3" size={30} />
        Loading airports for {country}...
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gray-50 dark:bg-zinc-950 overflow-y-auto">
      <div className="px-6 sm:px-10 py-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Airports in {country}
        </h2>

        {airports.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No airports found.</p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {airports.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToDeals(a.iata_code)}
                className="group text-left rounded-2xl overflow-hidden shadow-md hover:shadow-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <div className="relative w-full aspect-[5/3]">
                  <Image
                    src={a.image || "/fallbacks/landscape.jpg"}
                    alt={`${a.city || a.name}`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                    {a.city || a.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {a.name}
                  </p>
                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400">
                    IATA: {a.iata_code}
                  </p>

                  <div className="mt-3 bg-blue-600 group-hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition text-center">
                    View Deals
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}