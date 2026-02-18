"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../AuthProvider";
import { Loader2, Plus } from "lucide-react";
import { Globe2, Plane, Map, Mountain, Sun, Palmtree } from "lucide-react";

const GROUP_ICON_MAP: Record<string, any> = {
  globe: Globe2,
  plane: Plane,
  map: Map,
  mountain: Mountain,
  sun: Sun,
  palmtree: Palmtree,
};

type Conversation = {
  id: string;
  type: "dm" | "group";
  memberIds: string[];
  title?: string;
  groupIcon?: string;
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
  lastMessage?: { text: string; senderId: string; createdAt?: { seconds: number; nanoseconds: number } };
};

type UserDoc = {
  displayName?: string;
  photoURL?: string;
};

function timeLabel(ts?: { seconds: number; nanoseconds: number }) {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MessagesShell({
  selectedId,
  onSelect,
  onCreate,
}: {
  selectedId: string | null;
  onSelect: (c: Conversation) => void;
  onCreate: () => void;
}) {
  const { user, loading } = useAuth();

  const [convos, setConvos] = useState<Conversation[]>([]);
  const [convosLoading, setConvosLoading] = useState(true);

  const [userCache, setUserCache] = useState<Record<string, UserDoc | null>>({});

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setConvos([]);
      setConvosLoading(false);
      return;
    }

    setConvosLoading(true);

    const q = query(
      collection(db, "conversations"),
      where("memberIds", "array-contains", user.uid),
      orderBy("updatedAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Conversation[];
        setConvos(data);
        setConvosLoading(false);
      },
      () => {
        setConvos([]);
        setConvosLoading(false);
      }
    );

    return () => unsub();
  }, [user, loading]);

  const dmOtherIds = useMemo(() => {
    if (!user) return [];
    const ids: string[] = [];
    for (const c of convos) {
      if (c.type !== "dm") continue;
      const other = (c.memberIds ?? []).find((id) => id !== user.uid);
      if (other) ids.push(other);
    }
    return Array.from(new Set(ids));
  }, [convos, user]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const missing = dmOtherIds.filter((id) => !(id in userCache));
      if (missing.length === 0) return;

      const fetched = await Promise.all(
        missing.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            return [uid, snap.exists() ? (snap.data() as any as UserDoc) : null] as const;
          } catch {
            return [uid, null] as const;
          }
        })
      );

      if (cancelled) return;

      setUserCache((prev) => {
        const next = { ...prev };
        for (const [uid, data] of fetched) next[uid] = data;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dmOtherIds, userCache]);

  const dmMeta = (c: Conversation) => {
    if (!user || c.type !== "dm") return { label: c.title ?? "Chat", photo: "/logo.png" };

    const other = (c.memberIds ?? []).find((id) => id !== user.uid);
    if (!other) return { label: "Direct message", photo: "/logo.png" };

    const u = userCache[other];
    const name = (u?.displayName ?? "").trim();
    const photo = (u?.photoURL ?? "").trim();

    return {
      label: name.length ? name : `@${other.slice(0, 8)}`,
      photo: photo.length ? photo : "/logo.png",
    };
  };

  const labelFor = (c: Conversation) => {
    if (!user) return c.title ?? "Chat";

    if (c.type === "group") {
      const t = (c.title ?? "").trim();
      return t.length ? t : "Group chat";
    }

    return dmMeta(c).label;
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-white/80">Chats</div>
        <button
          type="button"
          onClick={onCreate}
          className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition text-xs font-semibold"
        >
          <Plus size={16} />
          New
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {convosLoading ? (
          <div className="p-6 flex items-center gap-2 text-white/70">
            <Loader2 className="animate-spin" size={18} />
            Loading…
          </div>
        ) : convos.length === 0 ? (
          <div className="p-6 text-white/60">
            No conversations yet.
            <div className="mt-3">
              <button
                type="button"
                onClick={onCreate}
                className="px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[13px] font-semibold text-white"
              >
                Start a chat
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {convos.map((c) => {
              const active = selectedId === c.id;
              const dm = c.type === "dm";
              const meta = dm ? dmMeta(c) : null;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className={["w-full text-left px-4 py-3 transition", active ? "bg-white/10" : "hover:bg-white/[0.04]"].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    {dm ? (
                      <div className="relative h-10 w-10 rounded-full overflow-hidden border border-white/10 bg-white/10 shrink-0">
                        <Image src={meta!.photo} alt={meta!.label} fill unoptimized className="object-cover" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-white/70">
                        {(() => {
                          const Icon = GROUP_ICON_MAP[c.groupIcon ?? "globe"] ?? Globe2;
                          return <Icon size={18} />;
                        })()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-white/90 truncate">{labelFor(c)}</div>
                          <div className="mt-1 text-[12px] text-white/55 line-clamp-1">
                            {c.lastMessage?.text ? c.lastMessage.text : "No messages yet"}
                          </div>
                        </div>
                        <div className="text-[11px] text-white/45 whitespace-nowrap">
                          {timeLabel(c.updatedAt ?? c.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
