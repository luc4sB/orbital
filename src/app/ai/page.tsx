"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getCountriesGeoJSON } from "../lib/countriesGeo";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ViewMode = "explore" | "learn";
type ChatMsg = { role: "user" | "assistant"; content: string };

type Trip = {
  id: string;
  title: string;
  body: string;
  countryCode: string; // in your DB this is the country NAME (e.g. "France", "Spain")
  cityName: string;
  createdAt?: { seconds: number; nanoseconds: number };
};

type Country = {
  name: string;
  lat: number;
  lon: number;
};

const COUNTRY_BLACKLIST = new Set<string>([
  "Isle of Man",
  "Guernsey",
  "Jersey",
  "Gibraltar",
  "Svalbard",
  "Åland",
  "Liechtenstein",
  "San Marino",
  "Andorra",
  "Monaco",
  "Vatican",
  "Kosovo",
  "Northern Cyprus",
  "Faroe Islands",
  "Azores",
  "Madeira",
  "Canary Islands",
  "Jan Mayen",
  "Saint Pierre and Miquelon",
  "Greenland",
  "Western Sahara",
  "Somaliland",
  "Palestine",
  "Taiwan",
  "Bir Tawil",
  "Spratly Islands",
  "Paracel Islands",
  "Scarborough Shoal",
  "Aksai Chin",
  "Arunachal Pradesh",
  "Kashmir",
  "Ashmore and Cartier Islands",
  "Coral Sea Islands",
  "Heard Island and McDonald Islands",
  "South Georgia and the South Sandwich Islands",
  "Bouvet Island",
  "Tristan da Cunha",
  "British Indian Ocean Territory",
  "Diego Garcia",
  "Hong Kong",
  "Macau",
  "Bermuda",
  "Puerto Rico",
  "Falkland Islands",
  "French Guiana",
  "Reunion",
  "Mayotte",
  "Guadeloupe",
  "Martinique",
  "Cayman Islands",
  "Aruba",
  "Curaçao",
  "Guam",
  "American Samoa",
  "Northern Mariana Islands",
  "New Caledonia",
  "French Polynesia",
  "Wallis and Futuna",
  "Pitcairn Islands",
  "Saint Helena",
  "Saint Kitts and Nevis",
  "Antigua and Barbuda",
  "Dominica",
  "Saint Lucia",
  "Grenada",
  "Barbados",
  "Comoros",
  "Seychelles",
  "Mauritius",
  "Maldives",
  "Micronesia",
  "Palau",
  "Nauru",
  "Tuvalu",
  "Kiribati",
  "Marshall Islands",
  "Vanuatu",
  "Samoa",
  "Tonga",
  "Niue",
  "Cook Islands",
  "Tokelau",
  "Cape Verde",
  "Anguilla",
  "British Virgin Islands",
  "U.S. Virgin Islands",
  "Saint Barthélemy",
  "Saint Martin",
  "Sint Maarten",
  "Turks and Caicos Islands",
  "Montserrat",
  "Bonaire",
  "Norfolk Island",
  "Christmas Island",
  "Cocos (Keeling) Islands",
  "Easter Island",
]);

export default function AIPage() {
  const [mode, setMode] = useState<ViewMode>("explore");

  // Country picker (must select from list)
  const [allCountries, setAllCountries] = useState<Country[]>([]);
  const [countryQuery, setCountryQuery] = useState("");
  const [countrySuggestions, setCountrySuggestions] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>("");

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  const [chat, setChat] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Tell me what kind of trip you want (dates, budget, vibe, weather, who you’re travelling with). I’ll suggest a few countries.",
    },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const reqIdRef = useRef(0);

  // Load country list once
  useEffect(() => {
    getCountriesGeoJSON()
      .then((data) => {
        const countries: Country[] = (data.features ?? [])
          .filter((f: any) => {
            const name = f.properties?.name;
            return (
              name &&
              f.properties?.label_y &&
              f.properties?.label_x &&
              !COUNTRY_BLACKLIST.has(name)
            );
          })
          .map((f: any) => ({
            name: f.properties.name,
            lat: f.properties.label_y,
            lon: f.properties.label_x,
          }));
        setAllCountries(countries);
      })
      .catch((err) => console.error("Failed to load countries.geojson", err));
  }, []);

  // Reset starter message + clear selections when switching modes
  useEffect(() => {
    if (mode === "explore") {
      setChat([
        {
          role: "assistant",
          content:
            "Tell me what kind of trip you want (dates, budget, vibe, weather, who you’re travelling with). I’ll suggest a few countries.",
        },
      ]);
      setSelectedCountry("");
      setCountryQuery("");
      setCountrySuggestions([]);
      setTrips([]);
    } else {
      setChat([
        {
          role: "assistant",
          content:
            "Pick a country and ask anything — itinerary ideas, best cities, safety, budgets, seasons, what to avoid. I’ll also use recent community trips as extra context.",
        },
      ]);
    }
    setAiInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleCountryChange = (value: string) => {
    setCountryQuery(value);
    setSelectedCountry(""); // must pick from dropdown

    const v = value.trim();
    if (!v) {
      setCountrySuggestions([]);
      return;
    }

    const filtered = allCountries
      .filter((c) => c.name.toLowerCase().includes(v.toLowerCase()))
      .slice(0, 8);

    setCountrySuggestions(filtered);
  };

  const handleCountrySelect = (c: Country) => {
    setSelectedCountry(c.name);
    setCountryQuery(c.name);
    setCountrySuggestions([]);
  };

  // Load recent trips for selected country (Learn mode only)
  useEffect(() => {
    const reqId = ++reqIdRef.current;

    if (mode !== "learn" || !selectedCountry) {
      setTrips([]);
      setTripsLoading(false);
      return;
    }

    setTripsLoading(true);

    (async () => {
      try {
        const q = query(
          collection(db, "trips"),
          where("countryCode", "==", selectedCountry),
          orderBy("createdAt", "desc"),
          limit(8)
        );

        const snap = await getDocs(q);
        if (reqId !== reqIdRef.current) return;

        const data: Trip[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setTrips(data);
      } catch (e) {
        console.error(e);
        if (reqId === reqIdRef.current) setTrips([]);
      } finally {
        if (reqId === reqIdRef.current) setTripsLoading(false);
      }
    })();
  }, [mode, selectedCountry]);

  const citySummary = useMemo(() => {
    const cities = trips
      .map((t) => (t.cityName ?? "").trim())
      .filter(Boolean);

    const counts = new Map<string, number>();
    for (const c of cities) counts.set(c, (counts.get(c) ?? 0) + 1);

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
  }, [trips]);

  const sendToAI = async () => {
    const prompt = aiInput.trim();
    if (!prompt || aiLoading) return;

    const nextChat: ChatMsg[] = [...chat, { role: "user", content: prompt }];
    setChat(nextChat);
    setAiInput("");
    setAiLoading(true);

    const endpoint = mode === "explore" ? "/api/ai/explore" : "/api/ai/travel";

    // block Learn until a valid selection exists
    if (mode === "learn" && !selectedCountry) {
        setChat((prev) => [
        ...prev,
        { role: "assistant", content: "Pick a country from the list first, then ask away." },
        ]);
        setAiLoading(false);
        return;
    }

    const payload =
        mode === "explore"
        ? { messages: nextChat }
        : {
            country: selectedCountry,
            posts: trips.slice(0, 8).map((t) => ({
                title: t.title,
                cityName: t.cityName,
                body: t.body,
            })),
            messages: nextChat,
            };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 50000);

    try {
        const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        });

        const text = await res.text();

        // try JSON but fall back to raw text
        let data: any = null;
        try {
        data = text ? JSON.parse(text) : null;
        } catch {
        data = null;
        }

        if (!res.ok) {
        const msg =
            data?.error ||
            data?.message ||
            (text ? text.slice(0, 200) : `HTTP ${res.status}`);
        throw new Error(`AI request failed (${res.status}): ${msg}`);
        }

        const answer =
        data?.answer ??
        data?.message ??
        (typeof text === "string" && text.trim() ? text : null) ??
        "Sorry — no answer.";

        setChat((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (e: any) {
        const message =
        e?.name === "AbortError"
            ? "Sorry — the AI request timed out. Try again."
            : `Sorry — I couldn’t generate a response right now.\n\n(${e?.message ?? "Unknown error"})`;

        console.error("AI error:", e);

        setChat((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
        window.clearTimeout(timeoutId);
        setAiLoading(false);
    }
  };

  return (
    <main className="pt-[calc(var(--nav-h,70px)+18px)] pb-[calc(var(--bottom-nav-h,64px)+10px)]">
      <div className="mx-auto max-w-5xl px-4">
        <div
  className="mt-4 rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl overflow-hidden flex flex-col"
  style={{
    height: "calc(100vh - var(--nav-h,70px) - var(--bottom-nav-h,64px) - 28px - 16px)",
  }}
>

          <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <h1 className="text-lg sm:text-xl font-semibold text-white/90">AI</h1>

              <div className="ml-auto flex items-center rounded-full border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setMode("explore")}
                  className={[
                    "px-3 py-1 rounded-full text-xs font-semibold transition",
                    mode === "explore" ? "bg-white/15 text-white" : "text-white/70 hover:text-white",
                  ].join(" ")}
                >
                  Explore
                </button>
                <button
                  type="button"
                  onClick={() => setMode("learn")}
                  className={[
                    "px-3 py-1 rounded-full text-xs font-semibold transition",
                    mode === "learn" ? "bg-white/15 text-white" : "text-white/70 hover:text-white",
                  ].join(" ")}
                >
                  Learn
                </button>
              </div>
            </div>

            {mode === "learn" && (
              <div className="mt-3">
                <div className="relative">
                  <input
                    value={countryQuery}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    placeholder="Choose a country…"
                    className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />

                  {countrySuggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-xl overflow-hidden z-50">
                      {countrySuggestions.map((s) => (
                        <li
                          key={s.name}
                          onClick={() => handleCountrySelect(s)}
                          className="px-4 py-2 cursor-pointer hover:bg-white/10 transition text-sm text-white/90"
                        >
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-2 text-[11px] text-white/55">
                  {selectedCountry ? (
                    <>
                      Using <span className="text-white/85 font-semibold">{selectedCountry}</span>.{" "}
                      {tripsLoading ? (
                        <span>Loading recent trips…</span>
                      ) : (
                        <>
                          Recent trips:{" "}
                          <span className="text-white/80 font-semibold">{trips.length}</span>
                          {citySummary.length ? (
                            <>
                              {" "}
                              • Cities: <span className="text-white/70">{citySummary.join(", ")}</span>
                            </>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : countryQuery.trim().length ? (
                    <span className="text-pink-200/80">
                      Select a country from the dropdown (free text isn’t accepted).
                    </span>
                  ) : (
                    <span>Pick a country to enable Learn mode context.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 px-5 sm:px-6 py-4 space-y-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chat.map((m, idx) => (
            <div
                key={idx}
                className={[
                "max-w-[92%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed border",
                m.role === "user"
                    ? "ml-auto bg-sky-500/15 border-sky-400/20 text-slate-100"
                    : "mr-auto bg-white/5 border-white/10 text-slate-100",
                ].join(" ")}
            >
                {m.role === "assistant" ? (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                    p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-white">
                        {children}
                        </strong>
                    ),
                    ul: ({ children }) => (
                        <ul className="list-disc ml-5 space-y-1 mb-2">
                        {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal ml-5 space-y-1 mb-2">
                        {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="text-slate-100">{children}</li>
                    ),
                    }}
                >
                    {m.content}
                </ReactMarkdown>
                ) : (
                m.content
                )}
            </div>
            ))}

            {aiLoading && (
              <div className="mr-auto max-w-[92%] rounded-2xl px-4 py-3 text-[12px] border bg-white/5 border-white/10 text-slate-200">
                Thinking…
              </div>
            )}
          </div>

          <div className="px-5 sm:px-6 py-3 border-t border-white/10">
            <div className="flex items-center gap-2">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendToAI();
                }}
                placeholder={
                  mode === "explore"
                    ? "Tell me what you want from a trip…"
                    : selectedCountry
                    ? `Ask about ${selectedCountry}…`
                    : "Pick a country first…"
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-2 text-[13px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                disabled={aiLoading}
              />
              <button
                onClick={sendToAI}
                disabled={aiLoading || !aiInput.trim() || (mode === "learn" && !selectedCountry)}
                className="px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[13px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>

            <div className="mt-2 text-[11px] text-white/45">
              Explore: Discover destinations • Learn: Find anything out about a desired country
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
