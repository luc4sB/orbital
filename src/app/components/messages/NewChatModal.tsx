"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, query, where, limit, serverTimestamp } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { X } from "lucide-react";
import { Globe2, Plane, Map, Mountain, Sun, Palmtree } from "lucide-react";

const GROUP_ICONS = [
  { key: "globe", Icon: Globe2 },
  { key: "plane", Icon: Plane },
  { key: "map", Icon: Map },
  { key: "mountain", Icon: Mountain },
  { key: "sun", Icon: Sun },
  { key: "palmtree", Icon: Palmtree },
];

type UserDoc = {
  displayName?: string;
  photoURL?: string;
};

type FriendRow = {
  uid: string;
  user: UserDoc | null;
};

export type Conversation = {
  id: string;
  type: "dm" | "group";
  memberIds: string[];
  title?: string;
  createdAt?: any;
  updatedAt?: any;
  lastMessage?: any;
};

export default function NewChatModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Conversation) => void;
}) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const [groupIcon, setGroupIcon] = useState<string>("globe");

  useEffect(() => {
    if (!open) return;

    if (!user) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
      onClose();
      return;
    }

    setLoading(true);
    setFriends([]);
    setQueryText("");
    setSelected({});
    setTitle("");
    setGroupIcon("globe");

    (async () => {
      try {
        const snap = await getDocs(collection(db, "friends", user.uid, "list"));
        const ids = snap.docs.map((d) => d.id);

        const rows = await Promise.all(
          ids.map(async (uid) => {
            try {
              const u = await getDoc(doc(db, "users", uid));
              return { uid, user: u.exists() ? (u.data() as UserDoc) : null };
            } catch {
              return { uid, user: null };
            }
          })
        );

        setFriends(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, user, onClose]);

  const pickedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return friends;

    return friends.filter((f) => {
      const name = (f.user?.displayName ?? "").toLowerCase();
      return name.includes(q) || f.uid.toLowerCase().includes(q);
    });
  }, [friends, queryText]);

  const togglePick = (uid: string) => {
    setSelected((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  // Prevent duplicate DM creation
  const findExistingDM = async (me: string, other: string) => {
    const qy = query(
      collection(db, "conversations"),
      where("type", "==", "dm"),
      where("memberIds", "array-contains", me),
      limit(50)
    );

    const snap = await getDocs(qy);
    for (const d of snap.docs) {
      const data = d.data() as any;
      const members = (data.memberIds ?? []) as string[];
      if (members.length === 2 && members.includes(other)) {
        return { id: d.id, ...(data as any) } as Conversation;
      }
    }
    return null;
  };

  const create = async () => {
    if (!user) return;
    if (pickedIds.length === 0) return;

    const members = Array.from(new Set([user.uid, ...pickedIds]));
    const type: "dm" | "group" = members.length === 2 ? "dm" : "group";
    const t = type === "group" ? title.trim() : "";

    // If DM reuse existing
    if (type === "dm") {
      const other = members.find((m) => m !== user.uid)!;
      const existing = await findExistingDM(user.uid, other);
      if (existing) {
        onCreated(existing);
        return;
      }
    }

    const ref = await addDoc(collection(db, "conversations"), {
      type,
      memberIds: members,
      title: type === "group" && t.length ? t : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
      groupIcon: type === "group" ? groupIcon : null,
    });

    onCreated({
      id: ref.id,
      type,
      memberIds: members,
      title: type === "group" && t.length ? t : undefined,
    });
  };

  if (!open) return null;

  const needsGroupTitle = pickedIds.length >= 2;
  const createDisabled = pickedIds.length === 0 || (needsGroupTitle && title.trim().length === 0);

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close" />

      <div className="relative z-[121] mx-auto w-full max-w-lg px-4 pt-8">
        <div className="rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
            <div className="text-sm font-semibold text-white/90">New chat</div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search friends…"
              className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />

            {pickedIds.length >= 2 && (
              <div className="mt-2 space-y-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Group name…"
                  className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />

                <div>
                  <div className="text-[11px] text-white/55 mb-2">Choose group icon</div>
                  <div className="grid grid-cols-6 gap-2">
                    {GROUP_ICONS.map(({ key, Icon }) => {
                      const active = groupIcon === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setGroupIcon(key)}
                          className={[
                            "flex items-center justify-center rounded-xl p-2 border transition",
                            active
                              ? "bg-sky-500/20 border-sky-400/40 text-sky-200"
                              : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10",
                          ].join(" ")}
                        >
                          <Icon size={18} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="max-h-72 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {loading ? (
                  <div className="px-4 py-4 text-sm text-white/60">Loading…</div>
                ) : filtered.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-white/60">No friends found.</div>
                ) : (
                  filtered.map((f) => {
                    const picked = !!selected[f.uid];
                    const name =
                      f.user?.displayName && f.user.displayName.trim().length > 0
                        ? f.user.displayName
                        : `@${f.uid.slice(0, 8)}`;
                    const photo =
                      f.user?.photoURL && f.user.photoURL.trim().length > 0 ? f.user.photoURL : "/logo.png";

                    return (
                      <button
                        key={f.uid}
                        type="button"
                        onClick={() => togglePick(f.uid)}
                        className={[
                          "w-full px-4 py-3 flex items-center gap-3 text-left border-t border-white/10 transition",
                          picked ? "bg-sky-500/15" : "hover:bg-white/5",
                        ].join(" ")}
                      >
                        <div className="relative h-9 w-9 rounded-full overflow-hidden border border-white/10 bg-white/10 shrink-0">
                          <Image src={photo} alt={name} fill unoptimized className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-white/90 truncate">{name}</div>
                          <div className="text-[11px] text-white/50 truncate">{f.uid}</div>
                        </div>
                        <div
                          className={[
                            "h-5 w-5 rounded-full border flex items-center justify-center text-[11px] font-semibold",
                            picked ? "border-sky-400/40 bg-sky-400/20 text-sky-100" : "border-white/15 text-white/40",
                          ].join(" ")}
                        >
                          {picked ? "✓" : ""}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={create}
              disabled={createDisabled}
              className="w-full px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[13px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Create chat
            </button>

            <div className="text-[11px] text-white/45">
              Pick 1 friend for a DM • Pick 2+ friends for a group
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
