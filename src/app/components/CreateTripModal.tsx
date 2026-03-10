"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Link as LinkIcon } from "lucide-react";
import { doc, collection, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthProvider";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  open: boolean;
  countryCode?: string;
  onClose: () => void;
  onCreated?: () => void;
};

function isAllowedImageUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;

    const host = u.hostname.toLowerCase();
    const allowedHosts = new Set([
      "images.unsplash.com",
      "unsplash.com",
      "i.imgur.com",
      "imgur.com",
    ]);

    return allowedHosts.has(host);
  } catch {
    return false;
  }
}

export default function CreateTripModal({
  open,
  countryCode,
  onClose,
  onCreated,
}: Props) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [cityName, setCityName] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [countryInput, setCountryInput] = useState(countryCode ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const resolvedCountryCode = (countryCode ?? countryInput).trim();

  const canSubmit = useMemo(() => {
    return !!title.trim() && !!cityName.trim() && !!body.trim() && !!resolvedCountryCode;
  }, [title, cityName, body, resolvedCountryCode]);

  const imageOk = useMemo(() => {
    if (!imageUrl.trim()) return true;
    return isAllowedImageUrl(imageUrl.trim());
  }, [imageUrl]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setTitle("");
    setCityName("");
    setBody("");
    setImageUrl("");
    setCountryInput(countryCode ?? "");
    setErr(null);
    setLoading(false);
  }, [open, countryCode]);

  const handleSubmit = async () => {
    if (!user) {
      setErr("Please log in to post.");
      return;
    }

    if (!canSubmit) {
      setErr("Please fill in all fields.");
      return;
    }

    if (!imageOk) {
      setErr("Image URL must be https and from Unsplash or Imgur.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const tripRef = doc(collection(db, "trips"));
      const url = imageUrl.trim();

      await setDoc(tripRef, {
        userId: user.uid,
        title: title.trim(),
        cityName: cityName.trim(),
        body: body.trim(),
        countryCode: resolvedCountryCode,
        createdAt: serverTimestamp(),
        ...(url ? { imageUrl: url } : {}),
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
      });

      onCreated?.();
      onClose();
    } catch (e: any) {
      console.error("CreateTripModal submit failed:", e);
      setErr(String(e?.message ?? e?.code ?? "Failed to post. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="relative z-10 w-full max-w-md max-h-[85vh] rounded-3xl bg-slate-900/95 border border-white/10 shadow-2xl shadow-black/70 overflow-hidden flex flex-col"
          >
            <div className="px-5 pt-4 pb-3 bg-gradient-to-r from-slate-900 via-slate-900 to-pink-900/50 border-b border-white/10 flex items-center justify-between">
              <div className="flex flex-col leading-tight">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">POST</span>
                <span className="text-sm font-semibold text-white">Share a trip</span>
                <span className="text-[11px] text-slate-300">
                  {resolvedCountryCode ? `in ${resolvedCountryCode}` : "Choose a country"}
                </span>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 transition-colors"
                aria-label="Close"
                type="button"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-3 bg-gradient-to-b from-slate-900/80 to-slate-950 overflow-y-auto scrollbar-hide">
              {err && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  {err}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-slate-300">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/60"
                  placeholder="My weekend in…"
                  maxLength={60}
                  disabled={loading}
                />
              </div>

              {!countryCode && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-300">Country</label>
                  <input
                    value={countryInput}
                    onChange={(e) => setCountryInput(e.target.value)}
                    className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/60"
                    placeholder="Country Name"
                    maxLength={40}
                    disabled={loading}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-slate-300">City</label>
                <input
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/60"
                  placeholder="City Name"
                  maxLength={40}
                  disabled={loading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300">Post</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full min-h-[60px] resize-none rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/60"
                  placeholder="What did you do, what did you love, what would you recommend?"
                  maxLength={600}
                  disabled={loading}
                />
                <div className="text-[10px] text-slate-500 text-right">{body.length}/600</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Image URL (optional)</label>

                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/10 px-3 py-1.5">
                  <LinkIcon size={16} className="text-slate-400" />
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
                    placeholder="https://images.unsplash.com/..."
                    disabled={loading}
                  />
                </div>

                {imageUrl.trim() && !imageOk && (
                  <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    Only https URLs from Unsplash or Imgur are allowed.
                  </div>
                )}

                {imageUrl.trim() && imageOk && (
                  <div className="relative w-full aspect-[3/2] rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                    <img
                      src={imageUrl.trim()}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !canSubmit || !imageOk}
                className="w-full rounded-xl py-3 font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-600 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                type="button"
              >
                {loading && <Loader2 className="animate-spin" size={16} />}
                {loading ? "Posting…" : "Post"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}