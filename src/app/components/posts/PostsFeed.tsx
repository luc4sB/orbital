"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import PostCard from "./PostCard";
import PostModal from "./PostModal";
import { useAuth } from "../AuthProvider";
import { getCountryToContinentMap } from "../../lib/countryContinent";

export type Trip = {
  id: string;
  userId: string;
  title: string;
  body: string;
  countryCode: string;
  cityName: string;
  imageUrl?: string;
  createdAt?: { seconds: number; nanoseconds: number };
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
};

type SortMode = "newest" | "popular" | "hot";
const PAGE_SIZE = 20;

function hotScore(t: Trip) {
  const likes = typeof t.likeCount === "number" ? t.likeCount : 0;
  const createdMs = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : 0;
  const ageHours = createdMs ? (Date.now() - createdMs) / 3_600_000 : 999999;
  const recency = Math.max(0, 72 - ageHours);
  return likes * 50 + recency * 10;
}

export default function PostsFeed() {
  const { user } = useAuth();

  const [sort, setSort] = useState<SortMode>("newest");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);

  const [friendsOnly, setFriendsOnly] = useState(false);

  const [countryQuery, setCountryQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");

  const [continent, setContinent] = useState("");
  const [countryToContinent, setCountryToContinent] = useState<Record<string, string>>({});

  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const [items, setItems] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const [selected, setSelected] = useState<Trip | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!filtersRef.current) return;
      if (!filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const map = await getCountryToContinentMap();
        if (!cancelled) setCountryToContinent(map);
      } catch (e) {
        console.error("Failed to load country->continent map:", e);
        if (!cancelled) setCountryToContinent({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const availableContinents = useMemo(() => {
    const set = new Set(Object.values(countryToContinent));
    return Array.from(set).sort();
  }, [countryToContinent]);

  useEffect(() => {
    if (!friendsOnly) {
      setFriendIds([]);
      setFriendsLoading(false);
      return;
    }
    if (!user) {
      setFriendIds([]);
      setFriendsLoading(false);
      return;
    }

    let cancelled = false;
    setFriendsLoading(true);

    (async () => {
      try {
        const col = collection(db, "friends", user.uid, "list");
        const snap = await getDocs(col);
        if (cancelled) return;
        setFriendIds(snap.docs.map((d) => d.id));
      } catch (e) {
        console.error("Failed to load friends list:", e);
        if (!cancelled) setFriendIds([]);
      } finally {
        if (!cancelled) setFriendsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [friendsOnly, user]);

  useEffect(() => {
    setLoading(true);

    const base = collection(db, "trips");
    const q =
      sort === "popular"
        ? query(base, orderBy("likeCount", "desc"), orderBy("createdAt", "desc"), limit(PAGE_SIZE))
        : query(base, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Trip[];
        setItems(data);
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(snap.docs.length === PAGE_SIZE);
        setLoading(false);
      },
      (err) => {
        console.error("Posts feed snapshot error:", err);
        setItems([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [sort]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    if (!lastDocRef.current) return;

    setLoadingMore(true);
    try {
      const base = collection(db, "trips");

      const q =
        sort === "popular"
          ? query(
              base,
              orderBy("likeCount", "desc"),
              orderBy("createdAt", "desc"),
              startAfter(lastDocRef.current),
              limit(PAGE_SIZE)
            )
          : query(base, orderBy("createdAt", "desc"), startAfter(lastDocRef.current), limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const more = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Trip[];

      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const m of more) if (!seen.has(m.id)) merged.push(m);
        return merged;
      });

      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? lastDocRef.current;
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("loadMore failed:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  const countrySuggestions = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return [];

    const set = new Set<string>();
    for (const t of items) {
      const name = (t.countryCode ?? "").trim();
      if (!name) continue;
      if (name.toLowerCase().includes(q)) set.add(name);
    }
    return Array.from(set).slice(0, 8);
  }, [countryQuery, items]);

  const anyFilters = friendsOnly || !!selectedCountry || !!continent;

  const clearFilters = () => {
    setFriendsOnly(false);
    setSelectedCountry("");
    setCountryQuery("");
    setContinent("");
  };

  const visible = useMemo(() => {
    let out = [...items];

    if (friendsOnly) {
      if (!user) {
        out = [];
      } else {
        const allow = new Set<string>([user.uid, ...friendIds]);
        out = out.filter((t) => allow.has(t.userId));
      }
    }

    if (selectedCountry) {
      out = out.filter((t) => (t.countryCode ?? "") === selectedCountry);
    }

    if (continent) {
      out = out.filter((t) => countryToContinent[t.countryCode] === continent);
    }

    if (sort === "hot") {
      out.sort((a, b) => hotScore(b) - hotScore(a));
    }

    return out;
  }, [items, friendsOnly, user, friendIds, selectedCountry, continent, sort, countryToContinent]);

  return (
    <>
      <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-semibold text-white/90">Posts</h1>

          <div className="ml-auto flex items-center gap-2 relative" ref={filtersRef}>
            <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setSort("newest")}
                className={[
                  "px-3 py-1 rounded-full text-xs font-semibold transition",
                  sort === "newest" ? "bg-white/15 text-white" : "text-white/70 hover:text-white",
                ].join(" ")}
              >
                Newest
              </button>
              <button
                type="button"
                onClick={() => setSort("popular")}
                className={[
                  "px-3 py-1 rounded-full text-xs font-semibold transition",
                  sort === "popular" ? "bg-white/15 text-white" : "text-white/70 hover:text-white",
                ].join(" ")}
              >
                Popular
              </button>
              <button
                type="button"
                onClick={() => setSort("hot")}
                className={[
                  "px-3 py-1 rounded-full text-xs font-semibold transition",
                  sort === "hot" ? "bg-white/15 text-white" : "text-white/70 hover:text-white",
                ].join(" ")}
              >
                Hot
              </button>
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((p) => !p)}
              className={[
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition inline-flex items-center gap-2",
                anyFilters
                  ? "bg-sky-500/20 border-sky-400/30 text-sky-200"
                  : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10",
              ].join(" ")}
            >
              <SlidersHorizontal size={14} />
              Filters
              {anyFilters && <span className="w-2 h-2 rounded-full bg-sky-400" />}
            </button>

            {filtersOpen && (
              <div className="absolute right-0 top-full mt-3 w-[280px] rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-xl p-4 z-50 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
                      return;
                    }
                    setFriendsOnly((p) => !p);
                  }}
                  className={[
                    "w-full text-left px-3 py-2 rounded-xl text-sm border transition",
                    friendsOnly
                      ? "bg-emerald-500/15 border-emerald-400/25 text-emerald-200"
                      : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10",
                  ].join(" ")}
                >
                  Friends only
                  {friendsOnly && friendsLoading ? <span className="ml-2 opacity-70">…</span> : null}
                </button>

                <div>
                  <input
                    value={countryQuery}
                    onChange={(e) => {
                      setCountryQuery(e.target.value);
                      setSelectedCountry("");
                    }}
                    placeholder="Country…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />

                  {countrySuggestions.length > 0 && (
                    <ul className="mt-2 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-xl overflow-hidden">
                      {countrySuggestions.map((name) => (
                        <li
                          key={name}
                          onClick={() => {
                            setSelectedCountry(name);
                            setCountryQuery(name);
                          }}
                          className="px-4 py-2 cursor-pointer hover:bg-white/10 transition text-sm text-white/90"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <select
                  value={continent}
                  onChange={(e) => setContinent(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                >
                  <option value="">Continent…</option>
                  {availableContinents.map((c) => (
                    <option key={c} value={c} className="bg-black">
                      {c}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  {anyFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        clearFilters();
                        setFiltersOpen(false);
                      }}
                      className="flex-1 px-3 py-2 rounded-xl text-sm border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="px-3 py-2 rounded-xl text-sm border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition inline-flex items-center gap-2"
                  >
                    <X size={14} />
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 text-[11px] text-white/45">
          {sort === "hot"
            ? "Hot: boosted by recency + likes"
            : sort === "popular"
            ? "Popular: most likes"
            : "Newest: latest posts first"}
          {anyFilters ? " • Filters active" : ""}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-white/70">
            <Loader2 className="animate-spin" size={18} />
            Loading posts…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-white/60">{anyFilters ? "No posts match your filters." : "No posts yet."}</div>
        ) : (
          <div className="divide-y divide-white/10">
            {visible.map((t) => (
              <PostCard key={t.id} trip={t} onOpen={() => setSelected(t)} />
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="p-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white/80 text-sm transition border border-white/10"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <PostModal open={!!selected} trip={selected} onClose={() => setSelected(null)} />
    </>
  );
}
