"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { X, Heart, MessageCircle, Share2, Loader2 } from "lucide-react";
import type { Trip } from "./PostsFeed";
import { useTripUI } from "./useTripUI";

function formatDate(ts?: { seconds: number; nanoseconds: number }) {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PostModal({
  trip,
  open,
  onClose,
}: {
  trip: Trip | null;
  open: boolean;
  onClose: () => void;
}) {
  const ui = useTripUI(trip);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const content = (
    <AnimatePresence>
      {open && trip && (
        <>
          <motion.div
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-0 z-[210] flex items-start justify-center px-3 sm:px-4 pt-6"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
          >
            <div className="relative w-full max-w-6xl">
              <div className="w-full rounded-3xl overflow-hidden border border-white/10 bg-black shadow-2xl flex flex-col max-h-[calc(100vh-90px)]">
                {/* Mobile top bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 md:hidden">
                  <div className="text-[13px] font-semibold text-white/90 truncate">
                    {trip.cityName}, {trip.countryCode}
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Desktop close */}
                <button
                  onClick={onClose}
                  className="hidden md:inline-flex absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                >
                  <X size={18} />
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0">
                  {/* Image */}
                  <div className="relative bg-black h-[34vh] md:h-auto md:aspect-square">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                  </div>

                  {/* Right */}
                  <div className="p-4 sm:p-6 flex flex-col min-h-0">
                    <div className="min-w-0">
                      <div className="text-base sm:text-lg font-semibold text-white/95 line-clamp-2">
                        {trip.title}
                      </div>
                      <div className="text-[12px] text-white/65 mt-1">
                        {trip.cityName}, {trip.countryCode} · {formatDate(trip.createdAt)}
                      </div>
                    </div>

                    <div className="mt-3 text-[13px] text-white/85 leading-relaxed break-words whitespace-pre-wrap">
                      {trip.body}
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex items-center gap-4">
                      <button
                        type="button"
                        onClick={ui.onToggleLike}
                        className={[
                          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] border transition",
                          ui.liked
                            ? "bg-pink-500/20 border-pink-400/30 text-pink-200"
                            : "bg-white/5 border-white/10 text-white/80 hover:text-white hover:bg-white/10",
                        ].join(" ")}
                      >
                        <Heart size={16} className={ui.liked ? "fill-current" : ""} />
                        <span>{ui.likeCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={ui.onShare}
                        className="inline-flex items-center gap-2 text-[13px] text-white/80 hover:text-white"
                      >
                        <Share2 size={16} />
                        <span>{ui.shareCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={ui.ensureComments}
                        className="inline-flex items-center gap-2 text-[13px] text-white/80 hover:text-white"
                      >
                        <MessageCircle size={16} />
                        <span>{ui.commentCount}</span>
                      </button>
                    </div>

                    {/* Comments */}
                    <div className="mt-4 border-t border-white/10 pt-4 flex-1 min-h-0 flex flex-col">
                      <div className="text-[12px] font-semibold text-white/80 mb-3">
                        Comments
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-3 pr-1">
                        {ui.commentsLoading ? (
                          <div className="py-4 flex items-center gap-2 text-white/60 text-sm">
                            <Loader2 className="animate-spin" size={16} />
                            Loading…
                          </div>
                        ) : (ui.comments?.length ?? 0) === 0 ? (
                          <div className="text-[12px] text-white/55">No comments yet.</div>
                        ) : (
                          ui.comments!.map((c) => (
                            <div
                              key={c.id}
                              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                            >
                              <div className="text-[11px] text-white/65">
                                @{(c.userId ?? "").slice(0, 8)}
                              </div>
                              <div className="mt-1 text-[13px] text-white/85 leading-relaxed break-words whitespace-pre-wrap">
                                {c.body}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          value={ui.commentDraft}
                          onChange={(e) => ui.setCommentDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") ui.onAddComment();
                          }}
                          placeholder={ui.canInteract ? "Write a comment…" : "Log in to comment"}
                          className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-2 text-[13px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        />
                        <button
                          onClick={ui.onAddComment}
                          disabled={!ui.commentDraft.trim()}
                          className="px-3 py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-[13px] font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Send
                        </button>
                      </div>

                      {!ui.canInteract && (
                        <div className="mt-2 text-xs text-white/45">
                          Log in to like and comment.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-3 md:hidden" />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
