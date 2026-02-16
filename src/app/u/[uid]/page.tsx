"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import { toggleLikeTrip, shareTrip, loadTripComments, addTripComment } from "../../lib/tripActions";
import { useAuth } from "../../components/AuthProvider";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  increment,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { X, Heart, Share2 } from "lucide-react";

type Trip = {
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

type UserDoc = {
  displayName: string;
  photoURL?: string;
  bio?: string;
  friendCount?: number;
};

type CommentDoc = {
  id: string;
  tripId: string;
  userId: string;
  body: string;
  createdAt?: { seconds: number; nanoseconds: number };
};

type FriendRequestDoc = {
  id: string;
  fromUid: string;
  toUid: string;
  status: "pending" | "accepted" | "rejected";
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
};

function formatDate(ts?: { seconds: number; nanoseconds: number }) {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(ts?: { seconds: number; nanoseconds: number }) {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const search = useSearchParams();
  const focusPostId = search.get("post");

  const { user } = useAuth();

  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [likedByMeActive, setLikedByMeActive] = useState(false);

  const [friendCount, setFriendCount] = useState(0);
  const [friendStatus, setFriendStatus] = useState<
    "none" | "requested_by_me" | "requested_me" | "friends"
  >("none");
  const [friendBusy, setFriendBusy] = useState(false);

  const [incomingRequests, setIncomingRequests] = useState<FriendRequestDoc[]>([]);
  const [requestUsers, setRequestUsers] = useState<Record<string, UserDoc | null>>({});
  const [requestsBusy, setRequestsBusy] = useState(false);

  const friendRequestId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);


  const activeTrip = useMemo(
    () => (activePostId ? trips.find((t) => t.id === activePostId) ?? null : null),
    [activePostId, trips]
  );

  const totalLikes = useMemo(
    () =>
      trips.reduce(
        (sum, t) => sum + (typeof t.likeCount === "number" ? t.likeCount : 0),
        0
      ),
    [trips]
  );

  const isOwnProfile = !!user && user.uid === uid;

  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const [shareToast, setShareToast] = useState<string | null>(null);
  const [commentToast, setCommentToast] = useState<string | null>(null);
  const patchTrip = (tripId: string, patch: Partial<Trip>) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, ...patch } : t)));
  };

  const showCommentToast = (msg: string) => {
    setCommentToast(msg);
    window.setTimeout(() => setCommentToast(null), 1400);
  };

  const toggleLike = async (tripId: string) => {
    if (!user) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
      return;
    }

    const prevLiked = likedByMeActive;
    const prevCount = activeTrip?.likeCount ?? 0;

    // optimistic UI
    setLikedByMeActive(!prevLiked);
    patchTrip(tripId, { likeCount: Math.max(0, prevCount + (prevLiked ? -1 : 1)) });

    try {
      await toggleLikeTrip(tripId, user.uid);
    } catch (e) {
      console.error("toggleLike failed:", e);

      // rollback
      setLikedByMeActive(prevLiked);
      patchTrip(tripId, { likeCount: prevCount });
    }
  };

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    (async () => {
      try {
        const u = await getDoc(doc(db, "users", uid));
        if (cancelled) return;

        const data = u.exists() ? (u.data() as any) : null;
        setProfile(data);

        if (user && user.uid !== uid) {
          setFriendCount(typeof data?.friendCount === "number" ? data.friendCount : 0);
        }
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, user]);

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    let unsubFriends: (() => void) | null = null;

    if (user && user.uid === uid) {
      const colRef = collection(db, "friends", uid, "list");
      unsubFriends = onSnapshot(
        colRef,
        (snap) => {
          if (!cancelled) setFriendCount(snap.size);
        },
        (err) => {
          console.error("friends onSnapshot failed:", err);
          if (!cancelled) setFriendCount(0);
        }
      );
    } else {
    }

    (async () => {
      try {
        const qTrips = query(
          collection(db, "trips"),
          where("userId", "==", uid),
          orderBy("createdAt", "desc"),
          limit(60)
        );

        const snap = await getDocs(qTrips);
        if (cancelled) return;

        setTrips(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch (e) {
        console.error("load trips failed:", e);
        if (!cancelled) setTrips([]);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubFriends) unsubFriends();
    };
  }, [uid, user]);

  useEffect(() => {
    if (!focusPostId) {
      setActivePostId(null);
      return;
    }
    setActivePostId(focusPostId);
  }, [focusPostId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!activeTrip?.id || !user) {
        setLikedByMeActive(false);
        return;
      }

      try {
        const likeRef = doc(db, "trips", activeTrip.id, "likes", user.uid);
        const snap = await getDoc(likeRef);
        if (!cancelled) setLikedByMeActive(snap.exists());
      } catch (e) {
        console.error("Failed to load active like state:", e);
        if (!cancelled) setLikedByMeActive(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, user]);

  

  useEffect(() => {
    if (!user || !uid || user.uid === uid) {
      setFriendStatus("none");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [reqSnap, friendDoc] = await Promise.all([
          getDoc(doc(db, "friendRequests", friendRequestId(user.uid, uid))),
          getDoc(doc(db, "friends", user.uid, "list", uid)),
        ]);

        if (cancelled) return;

        if (friendDoc.exists()) {
          setFriendStatus("friends");
          return;
        }

        if (reqSnap.exists() && (reqSnap.data() as any).status === "pending") {
          const d = reqSnap.data() as any;
          if (d.fromUid === user.uid) setFriendStatus("requested_by_me");
          else setFriendStatus("requested_me");
          return;
        }

        setFriendStatus("none");
      } catch {
        if (!cancelled) setFriendStatus("none");
      }
    })();


    return () => {
      cancelled = true;
    };
  }, [uid, user]);

  const sendFriendRequest = async () => {
    if (!user || !uid || user.uid === uid) return;
    setFriendBusy(true);

    const canonicalId = friendRequestId(user.uid, uid);
    const legacyId = `${user.uid}_${uid}`;

    const canonicalRef = doc(db, "friendRequests", canonicalId);
    const legacyRef = doc(db, "friendRequests", legacyId);

    try {
      await runTransaction(db, async (tx) => {
        const canonicalSnap = await tx.get(canonicalRef);

        let legacySnap: any = null;
        if (legacyId !== canonicalId) {
          legacySnap = await tx.get(legacyRef);
        }

        if (!canonicalSnap.exists()) {
          tx.set(canonicalRef, {
            fromUid: user.uid,
            toUid: uid,
            status: "pending",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const data = canonicalSnap.data() as any;

          if (data.status === "pending") {
          } else if (data.status === "rejected") {
            tx.update(canonicalRef, {
              status: "pending",
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (legacySnap?.exists()) {
          tx.delete(legacyRef);
        }
      });

      setFriendStatus("requested_by_me");
    } catch (e) {
      console.error("sendFriendRequest failed:", e);
    } finally {
      setFriendBusy(false);
    }
  };

  const cancelFriendRequest = async () => {
    if (!user || !uid) return;
    setFriendBusy(true);

    const canonicalId = friendRequestId(user.uid, uid);
    const legacyId = `${user.uid}_${uid}`;

    const canonicalRef = doc(db, "friendRequests", canonicalId);
    const legacyRef = doc(db, "friendRequests", legacyId);

    try {
      await runTransaction(db, async (tx) => {
        const canonicalSnap = await tx.get(canonicalRef);

        let legacySnap: any = null;
        if (legacyId !== canonicalId) {
          legacySnap = await tx.get(legacyRef);
        }

        if (canonicalSnap.exists()) tx.delete(canonicalRef);
        if (legacySnap?.exists()) tx.delete(legacyRef);
      });

      setFriendStatus("none");
    } catch (e) {
      console.error("cancelFriendRequest failed:", e);
    } finally {
      setFriendBusy(false);
    }
  };

  const unfriend = async (otherUid: string) => {
    if (!user) return;

    const a = user.uid;
    const b = otherUid;

    const myFriendRef = doc(db, "friends", a, "list", b);
    const theirFriendRef = doc(db, "friends", b, "list", a);

    const canonicalReqId = friendRequestId(a, b);
    const reqRef = doc(db, "friendRequests", canonicalReqId);

    try {
      await runTransaction(db, async (tx) => {
        const [mySnap, theirSnap, reqSnap] = await Promise.all([
          tx.get(myFriendRef),
          tx.get(theirFriendRef),
          tx.get(reqRef),
        ]);

        if (mySnap.exists()) tx.delete(myFriendRef);
        if (theirSnap.exists()) tx.delete(theirFriendRef);

        if (reqSnap.exists()) tx.delete(reqRef);
      });

      setFriendStatus("none");
      setFriendCount((c) => Math.max(0, c - 1));
    } catch (e) {
      console.error("unfriend failed:", e);
    }
  };

  const acceptFriendRequestFrom = async (fromUid: string) => {
    if (!user || !uid || user.uid !== uid) return;
    setRequestsBusy(true);

    const canonicalId = friendRequestId(fromUid, user.uid);
    const legacyId = `${fromUid}_${user.uid}`;

    const canonicalRef = doc(db, "friendRequests", canonicalId);
    const legacyRef = doc(db, "friendRequests", legacyId);

    const myFriendRef = doc(db, "friends", user.uid, "list", fromUid);
    const theirFriendRef = doc(db, "friends", fromUid, "list", user.uid);

    try {
      await runTransaction(db, async (tx) => {
        const canonicalSnap = await tx.get(canonicalRef);
        const legacySnap = legacyId !== canonicalId ? await tx.get(legacyRef) : null;

        const useCanonical = canonicalSnap.exists();
        const useLegacy = !useCanonical && !!legacySnap?.exists();

        if (!useCanonical && !useLegacy) throw new Error("Friend request not found");

        const snap = useCanonical ? canonicalSnap : (legacySnap as any);
        const data = snap.data() as any;

        if (data.toUid !== user.uid) throw new Error("Not recipient");
        if (data.status !== "pending") return;

        tx.update(snap.ref, {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });

        if (useCanonical && legacySnap?.exists() && legacyId !== canonicalId) {
          tx.delete(legacyRef);
        }
      });

      await runTransaction(db, async (tx) => {
        const mySnap = await tx.get(myFriendRef);
        const theirSnap = await tx.get(theirFriendRef);

        const needMine = !mySnap.exists();
        const needTheirs = !theirSnap.exists();

        if (needMine) tx.set(myFriendRef, { createdAt: serverTimestamp() });
        if (needTheirs) tx.set(theirFriendRef, { createdAt: serverTimestamp() });
      });

      setIncomingRequests((prev) => prev.filter((r) => r.fromUid !== fromUid));
      setFriendCount((c) => c + 1);
    } catch (e) {
      console.error("acceptFriendRequestFrom failed:", e);
    } finally {
      setRequestsBusy(false);
    }
  };

  const declineFriendRequestFrom = async (fromUid: string) => {
    if (!user || !uid || user.uid !== uid) return;
    setRequestsBusy(true);

    const incomingId = friendRequestId(fromUid, user.uid);
    const incomingRef = doc(db, "friendRequests", incomingId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(incomingRef);
        if (!snap.exists()) return;
        const data = snap.data() as any;
        if (data.status !== "pending") return;

        tx.update(incomingRef, {
          status: "rejected",
          updatedAt: serverTimestamp(),
        });
      });

      setIncomingRequests((prev) => prev.filter((r) => r.fromUid !== fromUid));
    } catch (e) {
      console.error(e);
    } finally {
      setRequestsBusy(false);
    }
  };

  useEffect(() => {
    if (!isOwnProfile || !user) {
      setIncomingRequests([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const qReq = query(
          collection(db, "friendRequests"),
          where("toUid", "==", user.uid),
          limit(50)
        );

        const snap = await getDocs(qReq);
        if (cancelled) return;

        const data = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }) as FriendRequestDoc)
          .filter((r) => r.status === "pending");

        setIncomingRequests(data);

        const uniqueFrom = Array.from(new Set(data.map((r) => r.fromUid)));
        const missing = uniqueFrom.filter((id) => !(id in requestUsers));

        if (missing.length) {
          const fetched = await Promise.all(
            missing.map(async (id) => {
              try {
                const u = await getDoc(doc(db, "users", id));
                return [id, u.exists() ? (u.data() as any) : null] as const;
              } catch {
                return [id, null] as const;
              }
            })
          );

          if (!cancelled) {
            setRequestUsers((m) => {
              const next = { ...m };
              for (const [id, u] of fetched) next[id] = u;
              return next;
            });
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setIncomingRequests([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, user, requestUsers]);

  useEffect(() => {
    if (!activeTrip) {
      setComments([]);
      setCommentsLoading(false);
      return;
    }

    let cancelled = false;
    setCommentsLoading(true);

    (async () => {
      try {
        const qCom = query(
          collection(db, "trips", activeTrip.id, "comments"),
          orderBy("createdAt", "desc"),
          limit(60)
        );

        const snap = await getDocs(qCom);
        if (cancelled) return;

        setComments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setCommentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTrip]);


  const addComment = async () => {
    if (!user || !activeTrip) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
      return;
    }

    const text = commentInput.trim();

    if (!text) {
      showCommentToast("Type a comment first");
      return;
    }
    if (text.length > 400) {
      showCommentToast("Comment too long (max 400)");
      return;
    }
    if (commentBusy) return;

    setCommentBusy(true);
    setCommentInput("");

    const optimistic: CommentDoc = {
      id: `local-${Date.now()}`,
      tripId: activeTrip.id,
      userId: user.uid,
      body: text,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    setComments((prev) => [optimistic, ...prev]);

    const prevCommentCount = activeTrip.commentCount ?? 0;
    patchTrip(activeTrip.id, { commentCount: prevCommentCount + 1 });

    const tripRef = doc(db, "trips", activeTrip.id);
    const commentRef = doc(collection(db, "trips", activeTrip.id, "comments"));

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

      // refresh comments to replace optimistic
      const snap = await getDocs(
        query(
          collection(db, "trips", activeTrip.id, "comments"),
          orderBy("createdAt", "desc"),
          limit(60)
        )
      );
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));

      // ✅ success feedback
      showCommentToast("Posted");
    } catch (e) {
      console.error("addComment failed:", e);

      // rollback optimistic
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      patchTrip(activeTrip.id, { commentCount: prevCommentCount });

      // restore input
      setCommentInput(text);

      // ✅ error feedback
      showCommentToast("Failed to post");
    } finally {
      setCommentBusy(false);
    }
  };

  const sharePost = async (tripId: string) => {
    const url = `${window.location.origin}/u/${uid}?post=${tripId}`;

    let success = false;
    let toast: string | null = null;

    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ url });
        success = true;
        toast = "Shared";
      }
    } catch {
    }

    if (!success) {
      try {
        await navigator.clipboard.writeText(url);
        success = true;
        toast = "Link copied";
      } catch {
        try {
          window.prompt("Copy this link:", url);
          toast = "Copy link";
        } catch {
          toast = "Could not share";
        }
      }
    }

    setShareToast(toast);
    window.setTimeout(() => setShareToast(null), 1400);

    if (!success) return;

    // Require login for counting shares (matches SocialPanel)
    if (!user) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
      return;
    }

    const prevCount = activeTrip?.shareCount ?? 0;

    // optimistic UI
    patchTrip(tripId, { shareCount: prevCount + 1 });

    try {
      await shareTrip(tripId, user.uid);
    } catch (e) {
      console.error("shareTrip failed:", e);
      // rollback
      patchTrip(tripId, { shareCount: prevCount });
    }
  };


  const closeModal = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("post");
    history.pushState({}, "", url.toString());
    setActivePostId(null);
  };

  const avatarUrl =
    profile?.photoURL && profile.photoURL.trim().length > 0
      ? profile.photoURL
      : "/logo.png";

  const displayName =
    profile?.displayName && profile.displayName.trim().length > 0
      ? profile.displayName
      : "User";

  return (
   <div className="bg-black text-white relative">
      <div
        className="mx-auto w-full max-w-3xl px-6"
        style={{
          height: "calc(100vh - var(--nav-h,70px) - var(--bottom-nav-h,64px))",
          paddingTop: "16px",
          paddingBottom: "16px",
        }}
      >
        <div className="h-full rounded-[2.25rem] border border-white/10 bg-white/5 shadow-[0_0_60px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col">
          <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="shrink-0 p-7 border-b border-white/10">
            <div className="flex flex-col items-center text-center">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border border-white/15 bg-white/10">
              <Image
                    src={avatarUrl}
                    alt={displayName}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>

                <div className="mt-3">
                  <h1 className="text-lg font-semibold tracking-tight">{displayName}</h1>
                  <p className="mt-1 text-[12px] text-white/55">@{uid.slice(0, 8)}</p>

                  {!!profile?.bio && (
                    <p className="mt-2 max-w-md text-[13px] text-white/80 leading-relaxed">
                      {profile.bio}
                    </p>
                  )}

                  {user && user.uid !== uid && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {friendStatus === "none" && (
                        <button
                          onClick={sendFriendRequest}
                          disabled={friendBusy}
                          className="px-5 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Add Friend
                        </button>
                      )}

                      {friendStatus === "requested_by_me" && (
                        <button
                          onClick={cancelFriendRequest}
                          disabled={friendBusy}
                          className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Requested (Cancel)
                        </button>
                      )}

                      {friendStatus === "requested_me" && (
                        <div className="px-5 py-2 rounded-full bg-white/10 text-sm font-semibold text-white">
                          They requested you
                        </div>
                      )}

                      {friendStatus === "friends" && (
                        <>
                          <div className="px-5 py-2 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-sm font-semibold text-emerald-200">
                            Friends
                          </div>
                          <button
                            onClick={() => unfriend(uid)}
                            disabled={friendBusy}
                            className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Unfriend
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                <div className="py-4 flex flex-col items-center justify-center">
                  <div className="text-lg font-semibold leading-none">{trips.length}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-white/55">
                    Trips
                  </div>
                </div>
                <div className="py-4 flex flex-col items-center justify-center border-x border-white/10">
                  <div className="text-lg font-semibold leading-none">
                    {isOwnProfile ? friendCount : "Private"}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-white/55">
                    Friends
                  </div>
                </div>
                <div className="py-4 flex flex-col items-center justify-center">
                  <div className="text-lg font-semibold leading-none">{totalLikes}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-white/55">
                    Likes
                  </div>
                </div>
              </div>

              {isOwnProfile && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div className="text-sm font-semibold text-white/90">Friend requests</div>
                    <div className="text-[12px] text-white/50">
                      {incomingRequests.length}
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {incomingRequests.length === 0 ? (
                      <div className="px-5 py-4 text-[12px] text-white/55">
                        No requests right now.
                      </div>
                    ) : (
                      incomingRequests.map((r) => {
                        const u = requestUsers[r.fromUid];
                        const name =
                          u?.displayName && u.displayName.trim().length > 0
                            ? u.displayName
                            : r.fromUid.slice(0, 8);
                        const photo =
                          u?.photoURL && u.photoURL.trim().length > 0
                            ? u.photoURL
                            : "/logo.png";

                        return (
                          <div
                            key={r.id}
                            className="px-5 py-3 border-t border-white/10 flex items-center gap-3"
                          >
                            <div className="relative h-9 w-9 rounded-full overflow-hidden border border-white/10 bg-white/10">
                              <Image
                                src={photo}
                                alt={name}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] text-white/90 truncate">
                                {name}
                              </div>
                              <div className="text-[11px] text-white/50">
                                @{r.fromUid.slice(0, 8)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => acceptFriendRequestFrom(r.fromUid)}
                                disabled={requestsBusy}
                                className="px-3 py-1.5 rounded-full bg-sky-500 hover:bg-sky-600 text-[12px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => declineFriendRequestFrom(r.fromUid)}
                                disabled={requestsBusy}
                                className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/10" />
          
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set("post", trip.id);
                    history.pushState({}, "", url.toString());
                    setActivePostId(trip.id);
                  }}
                  className="rounded-2xl overflow-hidden border border-white/10 bg-black/20 hover:bg-black/25 transition shadow-[0_10px_30px_rgba(0,0,0,0.28)] text-left"
                >
                  <div className="relative w-full aspect-square bg-white/5">
                    {trip.imageUrl ? (
                      <Image
                        src={trip.imageUrl}
                        alt={trip.title}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[12px] text-white/50">
                        No image
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="text-[12px] font-semibold text-white line-clamp-1">
                        {trip.title}
                      </div>
                      <div className="text-[11px] text-white/70 line-clamp-1">
                        {trip.cityName}, {trip.countryCode}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

      {activeTrip && (
  <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm">
    <button
      type="button"
      aria-label="Close"
      className="absolute inset-0"
      onClick={closeModal}
    />

    {/* Modal */}
    <div className="relative z-[101] mx-auto w-full max-w-6xl px-3 sm:px-4 pt-6">
      <div
        className={[
          "w-full rounded-3xl overflow-hidden border border-white/10 bg-black shadow-2xl",
          "flex flex-col",
          "max-h-[calc(100vh-24px)] md:max-h-[calc(100vh-90px)]",
        ].join(" ")}
      >
        {/* Top bar (mobile friendly) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 md:hidden">
          <div className="text-[13px] font-semibold text-white/90 truncate">
            {activeTrip.cityName}, {activeTrip.countryCode}
          </div>
          <button
            onClick={closeModal}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Desktop close button */}
        <button
          onClick={closeModal}
          className="hidden md:inline-flex absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0">
          <div className="relative bg-black h-[34vh] md:h-auto md:aspect-square">
            {activeTrip.imageUrl ? (
              <Image
                src={activeTrip.imageUrl}
                alt={activeTrip.title}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[12px] text-white/50">
                No image
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
          </div>

          <div className="p-4 sm:p-6 flex flex-col min-h-0">
            {/* Title + meta */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-semibold text-white/95 line-clamp-2">
                  {activeTrip.title}
                </div>
                <div className="text-[12px] text-white/65 mt-1">
                  {activeTrip.cityName}, {activeTrip.countryCode} ·{" "}
                  {formatDate(activeTrip.createdAt)}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                {shareToast && (
                  <div className="text-[12px] px-3 py-1.5 rounded-full bg-white/10 text-white/80">
                    {shareToast}
                  </div>
                )}
                {commentToast && (
                  <div className="text-[12px] px-3 py-1.5 rounded-full bg-white/10 text-white/80">
                    {commentToast}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 text-[13px] text-white/85 leading-relaxed break-words whitespace-pre-wrap">
              {activeTrip.body}
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => toggleLike(activeTrip.id)}
                disabled={!user}
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] border transition",
                  likedByMeActive
                    ? "bg-pink-500/20 border-pink-400/30 text-pink-200"
                    : "bg-white/5 border-white/10 text-white/80 hover:text-white hover:bg-white/10",
                  !user ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                title={user ? "Like" : "Log in to like"}
              >
                <Heart size={16} className={likedByMeActive ? "fill-current" : ""} />
                <span>{activeTrip.likeCount ?? 0}</span>
              </button>

              <button
                type="button"
                onClick={() => sharePost(activeTrip.id)}
                className="inline-flex items-center gap-2 text-[13px] text-white/80 hover:text-white"
              >
                <Share2 size={16} />
                <span>{activeTrip.shareCount ?? 0}</span>
              </button>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4 flex-1 min-h-0 flex flex-col">
              <div className="text-[12px] font-semibold text-white/80 mb-3">
                Comments
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-3 pr-1">
                {commentsLoading ? (
                  <div className="text-[12px] text-white/55">Loading…</div>
                ) : comments.length === 0 ? (
                  <div className="text-[12px] text-white/55">No comments yet.</div>
                ) : (
                  comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-white/65">
                          @{c.userId.slice(0, 8)}
                        </div>
                        <div className="text-[11px] text-white/45">
                          {c.createdAt ? formatTime(c.createdAt) : ""}
                        </div>
                      </div>
                      <div className="mt-1 text-[13px] text-white/85 leading-relaxed break-words whitespace-pre-wrap">
                        {c.body}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input row: compact on mobile */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addComment();
                  }}
                  placeholder={user ? "Write a comment…" : "Log in to comment"}
                  disabled={!user || commentBusy}
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-2 text-[13px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
                />
                <button
                  onClick={addComment}
                  disabled={!user || commentBusy || !commentInput.trim()}
                  className="px-3 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[13px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="h-3 md:hidden" />
      </div>
    </div>
  </div>
)}
      </div>
    </div>
  );
}
