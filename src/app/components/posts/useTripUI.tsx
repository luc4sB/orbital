"use client";

import { useEffect, useState } from "react";
import type { Trip } from "./PostsFeed";
import { useAuth } from "../AuthProvider";
import { addTripComment, loadTripComments, shareTrip, toggleLikeTrip } from "../../lib/tripActions";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

function openLogin() {
  window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "login" } }));
}

export function useTripUI(trip: Trip | null) {
  const { user } = useAuth();
  const canInteract = !!user;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);

  const [comments, setComments] = useState<any[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");

  // init counts + liked state
  useEffect(() => {
    if (!trip) return;

    setLikeCount(typeof trip.likeCount === "number" ? trip.likeCount : 0);
    setCommentCount(typeof trip.commentCount === "number" ? trip.commentCount : 0);
    setShareCount(typeof trip.shareCount === "number" ? trip.shareCount : 0);

    if (!user) {
      setLiked(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const likeRef = doc(db, "trips", trip.id, "likes", user.uid);
        const snap = await getDoc(likeRef);
        if (!cancelled) setLiked(snap.exists());
      } catch (e) {
        console.error("Failed to load like state:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trip?.id, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const onToggleLike = async () => {
    if (!trip) return;
    if (!user) return openLogin();

    const prev = liked;
    setLiked(!prev);
    setLikeCount((c) => Math.max(0, c + (prev ? -1 : 1)));

    try {
      await toggleLikeTrip(trip.id, user.uid);
    } catch (e) {
      console.error("toggleLikeTrip failed:", e);
      // rollback
      setLiked(prev);
      setLikeCount((c) => Math.max(0, c + (prev ? 1 : -1)));
    }
  };

  const onShare = async () => {
    if (!trip) return;

    // always copy link
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/u/${trip.userId}?post=${trip.id}`
        : `/u/${trip.userId}?post=${trip.id}`;

    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      console.error("Clipboard copy failed:", e);
    }

    // only count in firestore if logged in
    if (!user) return;

    setShareCount((c) => c + 1);
    try {
      await shareTrip(trip.id, user.uid);
    } catch (e) {
      console.error("shareTrip failed:", e);
      setShareCount((c) => Math.max(0, c - 1));
    }
  };

  const ensureComments = async () => {
    if (!trip) return;
    if (commentsLoading) return;

    setCommentsLoading(true);
    try {
      const items = await loadTripComments(trip.id);
      setComments(items);
    } catch (e) {
      console.error("loadTripComments failed:", e);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (!trip) return;

    setComments(null);
    setCommentsLoading(false);

    void ensureComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);


  const onAddComment = async () => {
    if (!trip) return;
    if (!user) return openLogin();

    const text = commentDraft.trim();
    if (!text) return;

    setCommentDraft("");

    const optimistic = {
      id: `local-${Date.now()}`,
      userId: user.uid,
      body: text,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    setComments((prev) => [optimistic, ...(prev ?? [])]);
    setCommentCount((c) => c + 1);

    try {
      await addTripComment(trip.id, user.uid, text);
      await ensureComments();
    } catch (e) {
      console.error("addTripComment failed:", e);
      setComments((prev) => (prev ?? []).filter((x) => x.id !== optimistic.id));
      setCommentCount((c) => Math.max(0, c - 1));
    }
  };

  return {
    canInteract,
    liked,
    likeCount,
    commentCount,
    shareCount,
    comments,
    commentsLoading,
    commentDraft,
    setCommentDraft,
    onToggleLike,
    onShare,
    ensureComments,
    onAddComment,
  };
}
