"use client";

import { useState } from "react";
import MessagesShell from "@/app/components/messages/MessagesShell";
import ChatView from "@/app/components/messages/ChatView";
import NewChatModal, { Conversation } from "@/app/components/messages/NewChatModal";

export default function MessagesPage() {
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <main className="pt-[calc(var(--nav-h,70px)+18px)] pb-[calc(var(--bottom-nav-h,64px)+10px)]">
      <div className="mx-auto max-w-3xl px-4">
        <div
          className="mt-4 rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl overflow-hidden flex flex-col"
          style={{
            height: "calc(100vh - var(--nav-h,70px) - var(--bottom-nav-h,64px) - 28px - 16px)",
          }}
        >
          <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <h1 className="text-lg sm:text-xl font-semibold text-white/90">Messages</h1>
            </div>
            <div className="mt-2 text-[11px] text-white/45">
              DMs and groups with friends • Create trip plans inside chats
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <div className="h-full grid grid-cols-1 md:grid-cols-[360px_1fr]">
              <div
                className={[
                  "border-white/10 min-h-0",
                  selected ? "hidden md:block border-r" : "block border-r-0 md:border-r",
                ].join(" ")}
              >
                <MessagesShell
                  selectedId={selected?.id ?? null}
                  onSelect={(c) => setSelected(c)}
                  onCreate={() => setCreateOpen(true)}
                />
              </div>

              <div className={["min-h-0", selected ? "block" : "hidden md:block"].join(" ")}>
                <ChatView conversation={selected} onBack={() => setSelected(null)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <NewChatModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(c) => {
          setCreateOpen(false);
          setSelected(c);
        }}
      />
    </main>
  );
}
