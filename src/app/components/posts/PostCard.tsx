"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import type { Trip } from "./PostsFeed";
import { useTripUI } from "./useTripUI";

function formatDate(ts?: { seconds: number; nanoseconds: number }) {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PostCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  const router = useRouter();
  const ui = useTripUI(trip);

  const openProfile = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    router.push(`/u/${trip.userId}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="w-full text-left p-4 sm:p-5 hover:bg-white/[0.03] transition cursor-pointer"
      aria-label="Open post"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          onClick={(e) => {
            e.stopPropagation();
            openProfile();
          }}
          className="text-left cursor-pointer"
          title="Open profile"
          role="link"
          tabIndex={-1}
        >
          <div className="text-white/90 font-semibold text-sm">
            {trip.cityName ? trip.cityName : "Trip"}
            <span className="text-white/45 font-normal"> · {formatDate(trip.createdAt)}</span>
          </div>

          <div className="text-white/45 text-xs flex items-center gap-2">
            <span>{trip.countryCode}</span>
            <span className="text-white/35">·</span>

            <button
              type="button"
              onClick={(e) => openProfile(e)}
              className="cursor-pointer underline-offset-4 hover:underline hover:text-white/80 focus:outline-none focus:ring-2 focus:ring-sky-500/40 rounded"
              title="Open profile"
            >
              @{trip.userId.slice(0, 8)}
            </button>
          </div>
        </div>

        <span className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/70 border border-white/10">
          Open
        </span>
      </div>

      <div className="mt-3">
        <div className="text-white/90 font-semibold">{trip.title}</div>
        <div className="mt-1 text-white/70 text-sm leading-relaxed line-clamp-3">{trip.body}</div>

        {trip.imageUrl && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <div className="relative w-full h-[180px] sm:h-[220px]">
              <Image src={trip.imageUrl} alt={trip.title} fill unoptimized className="object-cover" />
            </div>
          </div>
        )}
      </div>

      <div
        className="mt-4 flex items-center justify-between text-white/70"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={ui.onToggleLike}
          className={[
            "flex items-center gap-2 text-sm transition",
            ui.liked ? "text-white" : "hover:text-white",
          ].join(" ")}
          aria-pressed={ui.liked}
        >
          <Heart size={18} className={ui.liked ? "fill-white text-white" : ""} />
          <span>{ui.likeCount}</span>
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-2 text-sm hover:text-white transition"
        >
          <MessageCircle size={18} />
          <span>{ui.commentCount}</span>
        </button>

        <button
          type="button"
          onClick={ui.onShare}
          className="flex items-center gap-2 text-sm hover:text-white transition"
        >
          <Share2 size={18} />
          <span>{ui.shareCount}</span>
        </button>
      </div>
    </div>
  );
}
