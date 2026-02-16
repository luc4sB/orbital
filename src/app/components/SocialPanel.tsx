"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthProvider";
import { AnimatePresence, motion } from "framer-motion";
import { X, Heart, MessageCircle, Share2 } from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Trip = {
  id: string;
  userId: string;
  title: string;
  body: string;
  countryCode: string;
  cityName: string;
  imageUrl?: string;
  imagePath?: string;
  createdAt?: { seconds: number; nanoseconds: number };
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
};

type SocialPanelProps = {
  open: boolean;
  selectedCountry: string | null;
  onClose: () => void;
  onCreateTrip?: () => void;
  className?: string;
  slideFrom?: "left" | "right";
  refreshKey?: number;
  initialViewMode?: "community" | "ai";
  aiIntent?: "country" | "explore";
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

type PublicUser = {
  displayName?: string;
  photoURL?: string;
};


function formatDate(ts?: { seconds: number; nanoseconds: number }) {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function SocialPanel({
  open,
  selectedCountry,
  onClose,
  onCreateTrip,
  className = "",
  slideFrom = "left",
  refreshKey = 0,
  initialViewMode = "community",
  aiIntent = "country",
  expanded = false,
  onToggleExpanded,
}: SocialPanelProps) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);

  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentsByTrip, setCommentsByTrip] = useState<Record<string, any[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const [shareToast, setShareToast] = useState<Record<string, boolean>>({});
  const [shareCounts, setShareCounts] = useState<Record<string, number>>({});
  const [usersById, setUsersById] = useState<Record<string, PublicUser | null>>({});

  const router = useRouter();

  type ViewMode = "community" | "ai";
type ChatMsg = { role: "user" | "assistant"; content: string };

const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
const [chat, setChat] = useState<ChatMsg[]>(
  initialViewMode === "ai"
    ? [
        {
          role: "assistant",
          content:
            aiIntent === "explore"
              ? "Tell me what kind of trip you want (dates, budget, vibe, weather, who you’re travelling with). I’ll suggest a few countries."
              : `Ask me anything about travelling in ${selectedCountry ?? "this country"}.`,
        },
      ]
    : []
);
const [aiInput, setAiInput] = useState("");
const [aiLoading, setAiLoading] = useState(false);

useEffect(() => {
  setViewMode(initialViewMode);
  if (initialViewMode === "ai") {
    setChat([
      {
        role: "assistant",
        content:
          aiIntent === "explore"
            ? "Tell me what kind of trip you want (dates, budget, vibe, weather, who you’re travelling with). I’ll suggest a few countries."
            : `Ask me anything about travelling in ${selectedCountry ?? "this country"}.`,
      },
    ]);
  } else {
    setChat([]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [initialViewMode, aiIntent, selectedCountry]);


  const [stableCountry, setStableCountry] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!open || !selectedCountry) {
      setStableCountry(null);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      setStableCountry(selectedCountry);
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [open, selectedCountry]);

  useEffect(() => {
    const reqId = ++reqIdRef.current;

    if (!open || !stableCountry) {
      setTrips([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    (async () => {
      try {
        const q = query(
          collection(db, "trips"),
          where("countryCode", "==", stableCountry),
          orderBy("createdAt", "desc"),
          limit(50)
        );

        const snap = await getDocs(q);
        if (reqId !== reqIdRef.current) return;

        const data: Trip[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        setTrips(data);
      } catch (e) {
        if (reqId === reqIdRef.current) setTrips([]);
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    })();
  }, [open, stableCountry, refreshKey]);

  useEffect(() => {
    // initialise counts from the trip docs
    const like: Record<string, number> = {};
    const comments: Record<string, number> = {};
    const shares: Record<string, number> = {};

    for (const t of trips) {
      like[t.id] = typeof t.likeCount === "number" ? t.likeCount : 0;
      comments[t.id] = typeof t.commentCount === "number" ? t.commentCount : 0;
      shares[t.id] = typeof t.shareCount === "number" ? t.shareCount : 0;
    }

    setLikeCounts(like);
    setCommentCounts(comments);
    setShareCounts(shares);



    // if logged out, clear "liked" state
    if (!user) {
      setLikedByMe({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const entries = await Promise.all(
          trips.map(async (t) => {
            const likeRef = doc(db, "trips", t.id, "likes", user.uid);
            const snap = await getDoc(likeRef);
            return [t.id, snap.exists()] as const;
          })
        );

        if (cancelled) return;

        const likedMap: Record<string, boolean> = {};
        for (const [tripId, exists] of entries) likedMap[tripId] = exists;
        setLikedByMe(likedMap);
      } catch (e) {
        console.error("Failed to load likes:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trips, user]);


  const hasTrips = trips.length > 0;

  const sendToAI = async () => {
  const prompt = aiInput.trim();
  if (!prompt || aiLoading) return;

  const nextChat: ChatMsg[] = [...chat, { role: "user", content: prompt }];
  setChat(nextChat);
  setAiInput("");
  setAiLoading(true);

  try {
    const endpoint = aiIntent === "explore" ? "/api/ai/explore" : "/api/ai/travel";

const payload =
  aiIntent === "explore"
    ? {
        messages: nextChat,
      }
    : {
        country: selectedCountry,
        posts: trips.slice(0, 8).map((t) => ({
          title: t.title,
          cityName: t.cityName,
          body: t.body,
        })),
        messages: nextChat,
      };

if (aiIntent !== "explore" && !selectedCountry) {
  setChat((prev) => [
    ...prev,
    { role: "assistant", content: "Pick a country first, or use Explore mode to get country suggestions." },
  ]);
  return;
}

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});


    if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
    const data = await res.json();

    setChat((prev) => [...prev, { role: "assistant", content: data.answer ?? "Sorry — no answer." }]);
  } catch (e) {
    console.error(e);
    setChat((prev) => [
      ...prev,
      { role: "assistant", content: "Sorry — I couldn’t generate a response right now." },
    ]);
  } finally {
    setAiLoading(false);
  }
};

const toggleLike = async (tripId: string) => {
  if (!user) return;

  const tripRef = doc(db, "trips", tripId);
  const likeRef = doc(db, "trips", tripId, "likes", user.uid);

  const prevLiked = !!likedByMe[tripId];
  setLikedByMe((m) => ({ ...m, [tripId]: !prevLiked }));
  setLikeCounts((c) => ({ ...c, [tripId]: Math.max(0, (c[tripId] ?? 0) + (prevLiked ? -1 : 1)) }));

  try {
    await runTransaction(db, async (tx) => {
      const [tripSnap, likeSnap] = await Promise.all([
        tx.get(tripRef),
        tx.get(likeRef),
      ]);

      if (!tripSnap.exists()) throw new Error("Trip does not exist");

      const data = tripSnap.data() as { likeCount?: number };
      const current = typeof data.likeCount === "number" ? data.likeCount : 0;

      if (likeSnap.exists()) {
        // unlike
        tx.delete(likeRef);
        tx.update(tripRef, { likeCount: Math.max(0, current - 1) });
      } else {
        // like
        tx.set(likeRef, { createdAt: serverTimestamp() });
        tx.update(tripRef, { likeCount: current + 1 });
      }
    });

  } catch (e) {
    console.error("toggleLike failed:", e);

    // rollback optimistic update on error
    setLikedByMe((m) => ({ ...m, [tripId]: prevLiked }));
    setLikeCounts((c) => ({ ...c, [tripId]: Math.max(0, (c[tripId] ?? 0) + (prevLiked ? 1 : -1)) }));
  }
};

const loadComments = async (tripId: string) => {
  if (commentsLoading[tripId]) return;

  setCommentsLoading((m) => ({ ...m, [tripId]: true }));

  try {
    const q = query(
      collection(db, "trips", tripId, "comments"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    setCommentsByTrip((m) => ({ ...m, [tripId]: items }));
  } catch (e) {
    console.error("Failed to load comments:", e);
  } finally {
    setCommentsLoading((m) => ({ ...m, [tripId]: false }));
  }
};

const addComment = async (tripId: string) => {
  if (!user) return;

  const text = (commentDraft[tripId] ?? "").trim();
  if (!text) return;

  setCommentDraft((m) => ({ ...m, [tripId]: "" }));

  // optimistic UI
  const optimistic = {
    id: `local-${Date.now()}`,
    userId: user.uid,
    body: text,
    createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  };

  setCommentsByTrip((m) => ({
    ...m,
    [tripId]: [optimistic, ...(m[tripId] ?? [])],
  }));
  setCommentCounts((c) => ({ ...c, [tripId]: (c[tripId] ?? 0) + 1 }));

  const tripRef = doc(db, "trips", tripId);
  const commentsCol = collection(db, "trips", tripId, "comments");
  const commentRef = doc(commentsCol); // auto-id

  try {
    await runTransaction(db, async (tx) => {
      const tripSnap = await tx.get(tripRef);
      if (!tripSnap.exists()) throw new Error("Trip does not exist");

      const data = tripSnap.data() as { commentCount?: number };
      const current = typeof data.commentCount === "number" ? data.commentCount : 0;

      tx.set(commentRef, {
        userId: user.uid,
        body: text,
        createdAt: serverTimestamp(),
      });

      tx.update(tripRef, { commentCount: current + 1 });
    });

    // refresh to replace optimistic comment timestamp/order
    loadComments(tripId);
  } catch (e) {
    console.error("addComment failed:", e);

    // rollback optimistic changes
    setCommentsByTrip((m) => ({
      ...m,
      [tripId]: (m[tripId] ?? []).filter((x) => x.id !== optimistic.id),
    }));
    setCommentCounts((c) => ({ ...c, [tripId]: Math.max(0, (c[tripId] ?? 1) - 1) }));
  }
};

const sharePost = async (tripId: string, authorUid: string) => {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${authorUid}?post=${tripId}`
      : `/u/${authorUid}?post=${tripId}`;

  try {
    await navigator.clipboard.writeText(url);

    setShareToast((m) => ({ ...m, [tripId]: true }));
    setTimeout(() => {
      setShareToast((m) => ({ ...m, [tripId]: false }));
    }, 1200);
  } catch (e) {
    console.error("Clipboard copy failed:", e);
  }

  if (!user) return;

  const tripRef = doc(db, "trips", tripId);
  const shareRef = doc(db, "trips", tripId, "shares", user.uid);

  // optimistic count
  setShareCounts((c) => ({ ...c, [tripId]: (c[tripId] ?? 0) + 1 }));

  try {
    await runTransaction(db, async (tx) => {
      const [tripSnap, shareSnap] = await Promise.all([
        tx.get(tripRef),
        tx.get(shareRef),
      ]);

      if (!tripSnap.exists()) throw new Error("Trip does not exist");

      const data = tripSnap.data() as { shareCount?: number };
      const current = typeof data.shareCount === "number" ? data.shareCount : 0;

      if (!shareSnap.exists()) {
        tx.set(shareRef, { createdAt: serverTimestamp() });
      }

      tx.update(tripRef, { shareCount: current + 1 });
    });
  } catch (e) {
    console.error("sharePost failed:", e);
    // rollback optimistic
    setShareCounts((c) => ({ ...c, [tripId]: Math.max(0, (c[tripId] ?? 1) - 1) }));
  }
};

useEffect(() => {
  let cancelled = false;

  (async () => {
    const missing = Array.from(new Set(trips.map(t => t.userId))).filter(
      (uid) => usersById[uid] === undefined
    );
    if (missing.length === 0) return;

    try {
      const snaps = await Promise.all(missing.map((uid) => getDoc(doc(db, "users", uid))));
      if (cancelled) return;

      setUsersById((m) => {
        const next = { ...m };
        for (let i = 0; i < missing.length; i++) {
          const uid = missing[i];
          const s = snaps[i];
          next[uid] = s.exists() ? (s.data() as any) : null;
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to load post authors:", e);
    }
  })();

  return () => {
    cancelled = true;
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [trips, usersById]);

return (
  <AnimatePresence>
    {open && (selectedCountry || aiIntent === "explore") && (
      <>
        {/* Mobile overlay */}
        <motion.div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm md:hidden z-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Panel */}
        <motion.aside
          key={`${selectedCountry}-${refreshKey ?? 0}`}
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", stiffness: 90, damping: 14 }}
          className={[
            "fixed left-0 top-10 bottom-[var(--bottom-nav-h)] z-50 w-full",
            "lg:top-[var(--nav-h)]",
            expanded ? "lg:w-screen" : "sm:w-[440px]",
            "backdrop-blur-3xl bg-gradient-to-b from-white/10 to-black/40",
            "dark:from-zinc-900/70 dark:to-black/60",
            "border-r border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.4)]",
            "overflow-hidden",
            className ?? "",
          ].join(" ")}
        >
          <div className="relative h-full flex flex-col">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/20 dark:bg-zinc-800/60 hover:bg-white/30 transition z-10"
              aria-label="Close"
            >
              <X size={20} className="text-white" />
            </button>

            {/* Header title row */}
            <div className="pt-6 pb-3 px-6 border-b border-white/10">
              <div className="flex items-center">
                <h2 className="text-lg font-semibold text-white/90">
                  {viewMode === "community" ? "Community" : "Ask"}
                </h2>

                <div className="ml-auto mr-10 flex items-center rounded-full border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("community")}
                  className={[
                    "px-3 py-1 rounded-full text-xs font-semibold transition",
                    viewMode === "community"
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:text-white",
                  ].join(" ")}
                >
                  Community
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("ai")}
                  className={[
                    "px-3 py-1 rounded-full text-xs font-semibold transition",
                    viewMode === "ai"
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:text-white",
                  ].join(" ")}
                >
                  Ask AI
                </button>
              </div>
            </div>
          </div>

            {/* Share bar */}
            {viewMode === "community" && (
            <div className="px-6 pt-4 pb-4 border-b border-white/10">
              <div className="px-6 pt-4 pb-4 border-b border-white/10">
                {user ? (
                  <button
                    onClick={onCreateTrip}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-xs font-semibold text-white shadow-md shadow-sky-500/40 transition-colors"
                  >
                    <span>Share a trip</span>
                  </button>
                ) : (
                  <p className="text-[11px] text-slate-300">
                    Log in to share your trips in{" "}
                    <span className="font-semibold text-sky-300">{selectedCountry}</span>.
                  </p>
                )}
              </div>
            </div>
            )}

            {/* Feed */}
            {viewMode === "community" ? (
            <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {loading && (
                <div className="space-y-3">
                  <div className="h-56 rounded-2xl bg-slate-800/60 animate-pulse" />
                  <div className="h-56 rounded-2xl bg-slate-800/60 animate-pulse" />
                </div>
              )}

              {!loading && !hasTrips && (
                <div className="text-[12px] text-slate-400 text-center pt-6 px-2">
                  No trips shared here yet.
                  <br />
                  Be the first to post about this destination.
                </div>
              )}

              {!loading &&
                hasTrips &&
                trips.map((trip) => {
                    const author = usersById[trip.userId];
                  return(
                    <article
                      key={trip.id}
                      className="rounded-2xl border border-white/10 bg-black/20 hover:bg-black/25 transition overflow-hidden shadow-sm shadow-black/40"
                    >
                      {trip.imageUrl && (
                        <div className="relative w-full aspect-[16/9] bg-white/5">
                          <Image
                            src={trip.imageUrl}
                            alt={trip.title}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                          <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-3">
                            <div className="flex flex-col">
                              <h3 className="text-sm font-semibold text-white line-clamp-1 break-words">
                                {trip.title}
                              </h3>
                              <span className="text-[11px] text-slate-200/90">
                                {trip.cityName}, {trip.countryCode}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-200/80 whitespace-nowrap">
                              {formatDate(trip.createdAt)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="px-4 py-3">
                        <div className="mb-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/u/${trip.userId}`)}
                            className="group flex items-center gap-2 text-left cursor-pointer transition hover:bg-white/5 rounded-xl px-2 py-1 -mx-2"
                            title="View profile"
                          >
                            <div className="relative h-8 w-8 overflow-hidden rounded-full bg-white/10 border border-white/10">
                              {author?.photoURL ? (
                                <Image
                                  src={author.photoURL}
                                  alt=""
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="leading-tight">
                              <div className="text-[12px] font-semibold text-white/90">
                                {author?.displayName ?? `User ${trip.userId.slice(0, 6)}`}
                              </div>
                              <div className="text-[10px] text-white/50 group-hover:text-white/70">
                                View profile
                              </div>
                            </div>
                          </button>
                        </div>
                        {!trip.imageUrl && (
                          <header className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex flex-col">
                              <h3 className="text-sm font-semibold text-white line-clamp-2 break-words">
                                {trip.title}
                              </h3>
                              <span className="text-[11px] text-slate-400">
                                {trip.cityName}, {trip.countryCode}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap">
                              {formatDate(trip.createdAt)}
                            </span>
                          </header>
                        )}

                        <p className="text-[12px] text-slate-200 leading-relaxed line-clamp-5 break-words">
                          {trip.body}
                        </p>

                        {/* Actions */}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleLike(trip.id)}
                            disabled={!user}
                            className={[
                              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition",
                              likedByMe[trip.id]
                                ? "bg-pink-500/20 border-pink-400/30 text-pink-200"
                                : "bg-white/5 border-white/10 text-white/75 hover:text-white hover:bg-white/10",
                              !user ? "opacity-60 cursor-not-allowed" : "",
                            ].join(" ")}
                            aria-label="Like"
                            title={user ? "Like" : "Log in to like"}
                          >
                            <Heart size={14} className={likedByMe[trip.id] ? "fill-current" : ""} />
                            <span>{likeCounts[trip.id] ?? 0}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const next = !(commentsOpen[trip.id] ?? false);
                              setCommentsOpen((m) => ({ ...m, [trip.id]: next }));
                              if (next && !commentsByTrip[trip.id]) loadComments(trip.id);
                            }}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition bg-white/5 border-white/10 text-white/75 hover:text-white hover:bg-white/10"
                            aria-label="Comments"
                            title="Comments"
                          >
                            <MessageCircle size={14} />
                            <span>{commentCounts[trip.id] ?? 0}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => sharePost(trip.id, trip.userId)}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition bg-white/5 border-white/10 text-white/75 hover:text-white hover:bg-white/10"
                            aria-label="Share"
                            title="Share"
                          >
                            <Share2 size={14} />
                            <span>{shareCounts[trip.id] ?? 0}</span>
                          </button>

                          {shareToast[trip.id] && (
                            <span className="text-[11px] text-sky-200/90">Copied!</span>
                          )}
                        </div>
                        {commentsOpen[trip.id] && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                          {commentsLoading[trip.id] && (
                            <div className="text-[11px] text-slate-300">Loading comments…</div>
                          )}

                          {!commentsLoading[trip.id] && (commentsByTrip[trip.id]?.length ?? 0) === 0 && (
                            <div className="text-[11px] text-slate-300">No comments yet.</div>
                          )}

                          {!commentsLoading[trip.id] && (commentsByTrip[trip.id]?.length ?? 0) > 0 && (
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                              {commentsByTrip[trip.id].map((c) => (
                                <div key={c.id} className="text-[11px] text-slate-100">
                                  <span className="text-slate-300 mr-2">{c.userId?.slice(0, 6)}:</span>
                                  <span className="break-words">{c.body}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-2">
                            <input
                              value={commentDraft[trip.id] ?? ""}
                              onChange={(e) => setCommentDraft((m) => ({ ...m, [trip.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addComment(trip.id);
                              }}
                              placeholder={user ? "Write a comment…" : "Log in to comment"}
                              disabled={!user}
                              className="flex-1 bg-black/20 border border-white/10 rounded-full px-3 py-2 text-[12px] text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
                            />
                            <button
                              type="button"
                              onClick={() => addComment(trip.id)}
                              disabled={!user || !(commentDraft[trip.id] ?? "").trim()}
                              className="px-3 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[12px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Post
                            </button>
                          </div>
                        </div>
                        )}
                      </div>
                    </article>
                )})}
            </div>
              ):(
              <div className="flex-1 flex flex-col overflow-hidden">
              {/* Chat scroll area */}
              <div className="flex-1 px-6 py-5 space-y-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {chat.length === 0 && (
                  <div className="text-[12px] text-slate-300/90 leading-relaxed">
                    Ask about <span className="font-semibold text-white/90">{selectedCountry}</span>:
                    itinerary ideas, best cities, safety, budgets, seasons, what to avoid — and I’ll use recent posts
                    as extra context when available.
                  </div>
                )}

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
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => (
                            <strong className="font-semibold text-white">{children}</strong>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc ml-5 space-y-1 mb-2">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal ml-5 space-y-1 mb-2">{children}</ol>
                          ),
                          li: ({ children }) => <li className="text-slate-100">{children}</li>,
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

              {/* Input row */}
              <div className="px-6 py-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendToAI();
                    }}
                    placeholder={
                      aiIntent === "explore"
                        ? "Tell me what you want from a trip…"
                        : `Ask about ${selectedCountry ?? "this country"}...`
                    }
                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    disabled={aiLoading}
                  />
                  <button
                    onClick={sendToAI}
                    disabled={aiLoading || !aiInput.trim()}
                    className="px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </motion.aside>
      </>
    )}
  </AnimatePresence>
);

}
