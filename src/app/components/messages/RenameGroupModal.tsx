"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { X } from "lucide-react";

export default function RenameGroupModal({
  open,
  onClose,
  conversationId,
  initialTitle,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  initialTitle: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    setTitle(initialTitle);
    setBusy(false);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, initialTitle]);

  if (!open || !mounted) return null;

  const canSave = title.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;

    setBusy(true);
    try {
      const nextTitle = title.trim().slice(0, 80);
      await updateDoc(doc(db, "conversations", conversationId), {
        title: nextTitle,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" onClick={onClose} />

      <div className="relative z-[10000] mx-auto w-full max-w-md px-4">
        <div className="mt-[max(16px,env(safe-area-inset-top))] mb-[max(16px,env(safe-area-inset-bottom))] rounded-3xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">Rename group</div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Group name…"
              className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />

            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="w-full px-4 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Saving…" : "Save"}
            </button>

            <div className="text-[11px] text-white/45">Visible to everyone in the chat.</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
