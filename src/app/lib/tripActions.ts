import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export async function toggleLikeTrip(tripId: string, uid: string) {
  const tripRef = doc(db, "trips", tripId);
  const likeRef = doc(db, "trips", tripId, "likes", uid);

  await runTransaction(db, async (tx) => {
    const [tripSnap, likeSnap] = await Promise.all([tx.get(tripRef), tx.get(likeRef)]);
    if (!tripSnap.exists()) throw new Error("Trip does not exist");

    const data = tripSnap.data() as { likeCount?: number };
    const current = typeof data.likeCount === "number" ? data.likeCount : 0;

    if (likeSnap.exists()) {
      tx.delete(likeRef);
      tx.update(tripRef, { likeCount: Math.max(0, current - 1) });
    } else {
      tx.set(likeRef, { createdAt: serverTimestamp() });
      tx.update(tripRef, { likeCount: current + 1 });
    }
  });
}

export async function shareTrip(tripId: string, uid: string) {
  const tripRef = doc(db, "trips", tripId);
  const shareRef = doc(db, "trips", tripId, "shares", uid);

  await runTransaction(db, async (tx) => {
    const [tripSnap, shareSnap] = await Promise.all([tx.get(tripRef), tx.get(shareRef)]);
    if (!tripSnap.exists()) throw new Error("Trip does not exist");

    if (!shareSnap.exists()) {
      tx.set(shareRef, { createdAt: serverTimestamp() });
    }
    tx.update(tripRef, { shareCount: increment(1) });
  });
}

export async function loadTripComments(tripId: string) {
  const q = query(
    collection(db, "trips", tripId, "comments"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function addTripComment(tripId: string, uid: string, body: string) {
  const tripRef = doc(db, "trips", tripId);
  const commentsCol = collection(db, "trips", tripId, "comments");
  const commentRef = doc(commentsCol);

  await runTransaction(db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip does not exist");

    tx.set(commentRef, {
      userId: uid,
      body,
      createdAt: serverTimestamp(),
    });

    tx.update(tripRef, { commentCount: increment(1) });
  });
}
