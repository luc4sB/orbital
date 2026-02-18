"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../AuthProvider";
import { ArrowLeft, Loader2, Plus, Send, Pencil } from "lucide-react";
import CreateTripModal from "./CreateTripModal";
import EditTripModal from "./EditTripModal";
import RenameGroupModal from "./RenameGroupModal";

type Conversation = {
  id: string;
  type: "dm" | "group";
  memberIds: string[];
  title?: string;
  lastTripPlan?: {
    id: string;
    title?: string;
    destination?: { country?: string; city?: string };
    dates?: { start?: string; end?: string };
    createdAt?: any;
  };
};

type Msg = {
  id: string;
  senderId: string;
  type: "text" | "system" | "tripPlan";
  text?: string;
  tripPlanId?: string;
  createdAt?: any;
};

type TripPlanDoc = {
  title?: string;
  destination?: { country?: string; city?: string };
  dates?: { start?: string; end?: string };
  flights?: any[];
  hotels?: any[];
  itinerary?: any[];
  memberIds?: string[];
};

type UserDoc = {
  displayName?: string;
  photoURL?: string;
};

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") {
    try {
      const d = ts.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof ts?.seconds === "number") {
    const d = new Date(ts.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function dayKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function ChatView({
  conversation,
  onBack,
}: {
  conversation: Conversation | null;
  onBack: () => void;
}) {
  const { user } = useAuth();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const [tripOpen, setTripOpen] = useState(false);
  const [tripEditOpen, setTripEditOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [activeTrip, setActiveTrip] = useState<TripPlanDoc | null>(null);

  const [dmUser, setDmUser] = useState<UserDoc | null>(null);
  const [groupUsers, setGroupUsers] = useState<Record<string, UserDoc | null>>({});

  const convoId = conversation?.id ?? "";
  const activeTripId = conversation?.lastTripPlan?.id ?? "";

  const dmOtherId = useMemo(() => {
    if (!conversation || conversation.type !== "dm") return "";
    const me = user?.uid;
    const other = (conversation.memberIds ?? []).find((id) => id !== me);
    return other ?? "";
  }, [conversation, user?.uid]);

  useEffect(() => {
    if (!convoId) {
      setMsgs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qy = query(
      collection(db, "conversations", convoId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Msg[]);
        setLoading(false);
      },
      () => {
        setMsgs([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [convoId]);

  useEffect(() => {
    if (!activeTripId) {
      setActiveTrip(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "tripPlans", activeTripId),
      (snap) => {
        setActiveTrip(snap.exists() ? ((snap.data() as any) as TripPlanDoc) : null);
      },
      () => {
        setActiveTrip(null);
      }
    );

    return () => unsub();
  }, [activeTripId]);

  useEffect(() => {
    if (!dmOtherId) {
      setDmUser(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "users", dmOtherId),
      (snap) => {
        setDmUser(snap.exists() ? ((snap.data() as any) as UserDoc) : null);
      },
      () => {
        setDmUser(null);
      }
    );

    return () => unsub();
  }, [dmOtherId]);

  useEffect(() => {
    if (!conversation || conversation.type !== "group") {
      setGroupUsers({});
      return;
    }

    const ids = (conversation.memberIds ?? []).slice(0, 6);
    const unsubs: Array<() => void> = [];

    for (const uid of ids) {
      const unsub = onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          setGroupUsers((prev) => ({
            ...prev,
            [uid]: snap.exists() ? ((snap.data() as any) as UserDoc) : null,
          }));
        },
        () => {
          setGroupUsers((prev) => ({ ...prev, [uid]: null }));
        }
      );
      unsubs.push(unsub);
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [conversation?.id, conversation?.type, (conversation?.memberIds ?? []).join("|")]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  const ensureLoggedIn = () => {
    if (user) return true;
    window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
    return false;
  };

  const send = async () => {
    const body = text.trim();
    if (!convoId) return;
    if (!body || busy) return;
    if (!ensureLoggedIn()) return;

    setBusy(true);
    setText("");

    try {
      const msgRef = collection(db, "conversations", convoId, "messages");
      await addDoc(msgRef, {
        senderId: user!.uid,
        type: "text",
        text: body,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "conversations", convoId), {
        updatedAt: serverTimestamp(),
        lastMessage: {
          text: body.slice(0, 140),
          senderId: user!.uid,
          createdAt: serverTimestamp(),
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const headerTitle = useMemo(() => {
    if (!conversation) return "Messages";
    if (conversation.type === "group") {
      const t = (conversation.title ?? "").trim();
      return t.length ? t : "Group chat";
    }

    const name = (dmUser?.displayName ?? "").trim();
    if (name.length) return name;
    if (dmOtherId) return `@${dmOtherId.slice(0, 8)}`;
    return "Direct message";
  }, [conversation, dmUser?.displayName, dmOtherId]);

  const headerSubtitle = useMemo(() => {
    if (!conversation) return "";
    if (conversation.type === "dm") return "Direct message";
    return `${conversation.memberIds.length} members`;
  }, [conversation]);

  const headerPhoto = useMemo(() => {
    if (!conversation) return "";
    if (conversation.type !== "dm") return "";
    const p = (dmUser?.photoURL ?? "").trim();
    return p.length ? p : "/logo.png";
  }, [conversation, dmUser?.photoURL]);

  const groupAvatarIds = useMemo(() => {
    if (!conversation || conversation.type !== "group") return [];
    const ids = (conversation.memberIds ?? []).filter(Boolean);
    const ordered = user?.uid ? [user.uid, ...ids.filter((x) => x !== user.uid)] : ids;
    return ordered.slice(0, 3);
  }, [conversation, user?.uid]);

  const pinned = useMemo(() => {
    const fallback = conversation?.lastTripPlan;
    const tp = activeTrip;
    const t = (tp?.title ?? fallback?.title ?? "Trip plan").trim();
    const country = tp?.destination?.country ?? fallback?.destination?.country ?? "";
    const city = tp?.destination?.city ?? fallback?.destination?.city ?? "";
    const start = tp?.dates?.start ?? fallback?.dates?.start ?? "";
    const end = tp?.dates?.end ?? fallback?.dates?.end ?? "";
    const flights = Array.isArray(tp?.flights) ? tp!.flights!.length : 0;
    const hotels = Array.isArray(tp?.hotels) ? tp!.hotels!.length : 0;
    const itinerary = Array.isArray(tp?.itinerary) ? tp!.itinerary!.length : 0;
    return { t, country, city, start, end, flights, hotels, itinerary };
  }, [activeTrip, conversation?.lastTripPlan]);

  const items = useMemo(() => {
    const out: Array<
      | { kind: "sep"; key: string; label: string }
      | { kind: "msg"; key: string; msg: Msg; mine: boolean; time: string }
    > = [];

    let lastDay = "";

    for (const m of msgs) {
      const d = tsToDate(m.createdAt);
      if (d) {
        const dk = dayKeyFromDate(d);
        if (dk !== lastDay) {
          lastDay = dk;
          out.push({ kind: "sep", key: `sep:${dk}`, label: dayLabel(d) });
        }
      }

      const mine = !!user?.uid && m.senderId === user.uid;
      const t = d ? timeLabel(d) : "";
      out.push({ kind: "msg", key: m.id, msg: m, mine, time: t });
    }

    return out;
  }, [msgs, user?.uid]);

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-white/55 text-sm">
        Select a chat to start messaging.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden inline-flex items-center justify-center p-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>

        {conversation.type === "dm" ? (
          <div className="relative h-9 w-9 rounded-full overflow-hidden border border-white/10 bg-white/10 shrink-0">
            <Image src={headerPhoto} alt={headerTitle} fill unoptimized className="object-cover" />
          </div>
        ) : (
          <div className="h-9 w-9 shrink-0 relative">
            {groupAvatarIds.map((id, i) => {
              const p = (groupUsers[id]?.photoURL ?? "").trim() || "/logo.png";
              return (
                <div
                  key={`${id}:${i}`}
                  className="absolute h-7 w-7 rounded-full overflow-hidden border border-white/10 bg-white/10"
                  style={{ left: i * 10, top: i === 0 ? 0 : i === 1 ? 10 : 0 }}
                >
                  <Image src={p} alt="" fill unoptimized className="object-cover" />
                </div>
              );
            })}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white/90 truncate">{headerTitle}</div>
          <div className="text-[11px] text-white/45 truncate">{headerSubtitle}</div>
        </div>

        {conversation.type === "group" ? (
          <button
            type="button"
            onClick={() => {
              if (!ensureLoggedIn()) return;
              setRenameOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition text-xs font-semibold"
          >
            <Pencil size={16} />
            Name
          </button>
        ) : null}

        {!activeTripId ? (
          <button
            type="button"
            onClick={() => {
              if (!ensureLoggedIn()) return;
              setTripOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition text-xs font-semibold"
          >
            <Plus size={16} />
            Trip
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!ensureLoggedIn()) return;
              setTripEditOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition text-xs font-semibold"
          >
            <Pencil size={16} />
            Edit trip
          </button>
        )}
      </div>

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activeTripId ? (
          <button
            type="button"
            onClick={() => {
              if (!ensureLoggedIn()) return;
              setTripEditOpen(true);
            }}
            className="w-full text-left rounded-2xl border border-white/10 bg-white/5 overflow-hidden mb-4 hover:bg-white/[0.06] transition"
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55 font-semibold">Trip plan</div>
                  <div className="mt-1 text-[14px] font-semibold text-white/90 truncate">{pinned.t}</div>
                  <div className="mt-1 text-[12px] text-white/60 truncate">
                    {pinned.city && pinned.country ? `${pinned.city}, ${pinned.country}` : pinned.country || pinned.city}
                  </div>
                  <div className="mt-2 text-[12px] text-white/55">
                    {pinned.start && pinned.end ? `${pinned.start} → ${pinned.end}` : ""}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">Flights: {pinned.flights}</div>
                    <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">Hotels: {pinned.hotels}</div>
                    <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">Itinerary: {pinned.itinerary}</div>
                  </div>
                </div>

                <div className="shrink-0 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs font-semibold">Edit</div>
              </div>
            </div>
          </button>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-white/70">
            <Loader2 className="animate-spin" size={18} />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-white/55 text-sm">No messages yet.</div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              if (it.kind === "sep") {
                return (
                  <div key={it.key} className="flex items-center justify-center py-1">
                    <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/60">{it.label}</div>
                  </div>
                );
              }

              const m = it.msg;
              const mine = it.mine;
              const bubbleBase =
                m.type === "tripPlan" ? (m.text ?? "Trip plan attached").trim() : (m.text ?? "");

              return (
                <div key={it.key} className={mine ? "ml-auto max-w-[92%]" : "mr-auto max-w-[92%]"}>
                  <div
                    className={[
                      "rounded-2xl px-4 py-3 text-[13px] leading-relaxed border",
                      mine
                        ? "bg-sky-500/15 border-sky-400/20 text-slate-100"
                        : "bg-white/5 border-white/10 text-slate-100",
                    ].join(" ")}
                  >
                    {bubbleBase}
                  </div>
                  {it.time ? (
                    <div className={mine ? "mt-1 text-right text-[10px] text-white/35" : "mt-1 text-left text-[10px] text-white/35"}>
                      {it.time}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder={user ? "Message…" : "Log in to message"}
            disabled={!user || busy}
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-2 text-[13px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={!user || busy || !text.trim()}
            className="px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[13px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Send size={16} />
            Send
          </button>
        </div>
      </div>

      <CreateTripModal open={tripOpen} onClose={() => setTripOpen(false)} conversation={conversation} />

      <EditTripModal
        open={tripEditOpen}
        onClose={() => setTripEditOpen(false)}
        conversationId={convoId}
        tripPlanId={activeTripId}
        initial={activeTrip}
      />

      <RenameGroupModal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        conversationId={convoId}
        initialTitle={(conversation.title ?? "").trim()}
      />
    </div>
  );
}
