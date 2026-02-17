import PostsFeed from "../components/posts/PostsFeed";

export default function PostsPage() {
  return (
    <main className="pt-[calc(var(--nav-h,70px)+18px)] pb-[calc(var(--bottom-nav-h,64px)+10px)]">
      <div className="mx-auto max-w-3xl px-4">
        <div
          className="mt-4 rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl overflow-hidden flex flex-col"
          style={{
            height:
              "calc(100vh - var(--nav-h,70px) - var(--bottom-nav-h,64px) - 28px - 16px)",
          }}
        >
          <PostsFeed />
        </div>
      </div>
    </main>
  );
}
