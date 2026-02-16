"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bot, LayoutGrid, Globe2, MessageCircle, User } from "lucide-react";
import { useAuth } from "./AuthProvider";

type Item = {
  key: "ai" | "posts" | "globe" | "messages" | "profile";
  label: string;
  href: string;
  Icon: any;
};

const items: Item[] = [
  { key: "ai", label: "AI", href: "/ai", Icon: Bot },
  { key: "posts", label: "Posts", href: "/posts", Icon: LayoutGrid },
  { key: "globe", label: "Globe", href: "/", Icon: Globe2 },
  { key: "messages", label: "Messages", href: "/messages", Icon: MessageCircle },
  { key: "profile", label: "Profile", href: "/u", Icon: User },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { user } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[80]">
      <div className="w-full border-t border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-5 items-center py-2">
            {items.map(({ key, label, href, Icon }) => {
              const active = isActive(pathname, href);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === "profile") {
                      if (user) router.push(`/u/${user.uid}`);
                      else {
                        window.dispatchEvent(
                          new CustomEvent("open-auth-modal", {
                            detail: { mode: "login" },
                          })
                        );
                      }
                      return;
                    }

                    router.push(href);
                  }}
                  className={[
                    "flex flex-col items-center justify-center gap-0.5",
                    "py-2 text-[11px] transition",
                    "cursor-pointer select-none",
                    active ? "text-white" : "text-white/55 hover:text-white/80",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span className="leading-none">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}