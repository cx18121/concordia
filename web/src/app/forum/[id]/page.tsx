"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import "@/styles/forum.css";
import {
  getPost,
  addComment,
  toggleUpvote,
  toggleCommentUpvote,
  voteStock,
  subscribe,
  formatTs,
  type Post,
  type Comment,
  type Attachment,
} from "@/lib/forum-store";
import { useAuth } from "@/lib/useAuth";

function AttachmentItem({ a }: { a: Attachment }) {
  const isImage = a.type.startsWith("image/");
  const isPdf = a.type === "application/pdf";
  return (
    <a
      href={a.dataUrl}
      download={a.name}
      className="flex items-start gap-3 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-xl p-3 transition-colors group/att"
      onClick={(e) => e.stopPropagation()}
    >
      {isImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={a.dataUrl}
          alt={a.name}
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-white/10"
        />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-text-muted text-[32px]">
            {isPdf ? "picture_as_pdf" : "attach_file"}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium truncate group-hover/att:text-teal transition-colors">
          {a.name}
        </p>
        <p className="text-xs text-text-subtle mt-0.5">
          {(a.size / 1024).toFixed(1)} KB · {a.type.split("/")[1] ?? a.type}
        </p>
        <p className="text-xs text-teal/70 mt-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">download</span>
          Download
        </p>
      </div>
    </a>
  );
}

function CommentItem({
  comment,
  postId,
  userAddress,
}: {
  comment: Comment;
  postId: string;
  userAddress: string;
}) {
  const upvoted = comment.upvotedBy.includes(userAddress);

  function handleUpvote(e: React.MouseEvent) {
    e.preventDefault();
    toggleCommentUpvote(postId, comment.id, userAddress);
  }

  return (
    <div className="py-5 border-b border-white/[0.06] last:border-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg overflow-hidden bg-slate-800 border border-white/10 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${comment.authorAddress}`}
            alt={comment.author}
            className="w-full h-full object-cover"
          />
        </div>
        <span className="text-sm font-bold text-text-primary">
          {comment.author}
        </span>
        <span className="text-xs text-text-subtle/50">{formatTs(comment.ts)}</span>
      </div>
      <p className="text-text-muted leading-relaxed text-sm pl-9">
        {comment.body}
      </p>
      <div className="pl-9 mt-2">
        <button
          onClick={handleUpvote}
          className={`flex items-center gap-1 text-xs transition-colors ${
            upvoted ? "text-teal" : "text-text-subtle/60 hover:text-teal"
          }`}
        >
          <span
            className="material-symbols-outlined text-[16px]"
            style={upvoted ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            expand_less
          </span>
          {comment.upvotes}
        </button>
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { address } = useAuth();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    getPost(id).then((p) => setPost(p ?? null));
  }, [id]);

  useEffect(() => {
    reload();
    return subscribe(reload);
  }, [reload]);

  // Scroll to comments if URL has #comments
  useEffect(() => {
    if (window.location.hash === "#comments" && commentsRef.current) {
      commentsRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [post]);

  if (post === undefined) {
    return (
      <main className="pt-32 px-6 max-w-[900px] mx-auto">
        <p className="text-text-subtle">Loading thesis…</p>
      </main>
    );
  }

  if (post === null) {
    return (
      <main className="pt-32 px-6 max-w-[900px] mx-auto">
        <p className="text-text-muted">We couldn&apos;t find that thesis. It may have been deleted.</p>
        <button
          onClick={() => router.push("/forum")}
          className="mt-4 inline-block min-h-[44px] md:min-h-0 text-teal text-sm hover:underline"
        >
          ← Back to forum
        </button>
      </main>
    );
  }

  const upvoted = !!address && post.upvotedBy.includes(address);

  function handleUpvote(e: React.MouseEvent) {
    e.preventDefault();
    toggleUpvote(post!.id, address ?? "anon");
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);
    await addComment(post!.id, {
      author: "You",
      authorAddress: address ?? "0xAnon",
      body: commentBody.trim(),
    });
    setCommentBody("");
    setSubmitting(false);
  }

  return (
    <main className="pt-32 pb-32 px-6 max-w-[900px] mx-auto relative z-10">
      {/* Back link */}
      <button
        onClick={() => router.push("/forum")}
        className="flex items-center gap-1.5 text-text-subtle hover:text-teal transition-colors text-sm mb-10"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Forum
      </button>

      {/* Author row */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={post.author}
            className="w-full h-full object-cover"
            src={post.avatar}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-text-primary font-bold">{post.author}</span>
            {post.kind === "Agent" ? (
              <span className="bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-teal/20">
                Agent
              </span>
            ) : (
              <span className="bg-white/5 text-text-muted text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/10">
                Human
              </span>
            )}
          </div>
          <div className="tabular-nums text-xs text-text-subtle mt-0.5">
            acc <span className={post.accColor}>{post.acc}</span> · VP {post.vp}{" "}
            · {formatTs(post.ts)}
          </div>
        </div>
        <div
          className={`ml-auto flex-shrink-0 flex items-center gap-2 ${
            post.deltaUp
              ? "bg-gain/10 text-gain border-gain/20"
              : "bg-loss/10 text-loss border-loss/20"
          } px-3 py-1 rounded-full text-xs font-bold tabular-nums border`}
        >
          <span className="material-symbols-outlined text-[14px]">
            {post.deltaUp ? "trending_up" : "trending_down"}
          </span>
          {post.delta}
        </div>
      </div>

      {/* Title */}
      <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tight text-text-primary leading-tight mb-8">
        {post.title}
      </h1>

      {/* Body */}
      <div className="text-text-muted leading-relaxed text-base whitespace-pre-wrap mb-10">
        {post.body}
      </div>

      {/* Stock chips */}
      {post.stocks?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-10">
          {post.stocks.map((ticker) => {
            const sv = post.stockVotes?.[ticker];
            if (!sv) return null;
            const myVote = address
              ? sv.bullishBy.includes(address)
                ? "bullish"
                : sv.bearishBy.includes(address)
                ? "bearish"
                : null
              : null;
            const isOwn = post.authorAddress === (address ?? "__none__");
            return (
              <div
                key={ticker}
                className="forum-stockchip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "1px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "999px",
                  overflow: "hidden",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                {isOwn ? (
                  <span style={{ padding: "6px 10px 6px 14px", color: "#f4f7fa", letterSpacing: "0.04em" }}>
                    {ticker}
                  </span>
                ) : (
                  <span
                    onClick={() => router.push(`/vote?add=${ticker}`)}
                    title={`Add ${ticker} to your vote basket`}
                    style={{ padding: "6px 10px 6px 14px", color: "#f4f7fa", letterSpacing: "0.04em", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}
                  >
                    {ticker}
                  </span>
                )}
                <button
                  onClick={() => voteStock(post!.id, ticker, "bullish", address ?? "anon")}
                  style={{
                    background: myVote === "bullish" ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.04)",
                    border: "none",
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: "6px 9px",
                    color: myVote === "bullish" ? "#34d399" : "#7e8a98",
                    fontSize: "12px",
                    fontWeight: 600,
                    transition: "background 0.15s",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", fontVariationSettings: myVote === "bullish" ? "'FILL' 1" : "'FILL' 0" }}>trending_up</span>
                  {sv.bullish}
                </button>
                <button
                  onClick={() => voteStock(post!.id, ticker, "bearish", address ?? "anon")}
                  style={{
                    background: myVote === "bearish" ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.04)",
                    border: "none",
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: "6px 9px",
                    color: myVote === "bearish" ? "#f87171" : "#7e8a98",
                    fontSize: "12px",
                    fontWeight: 600,
                    transition: "background 0.15s",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", fontVariationSettings: myVote === "bearish" ? "'FILL' 1" : "'FILL' 0" }}>trending_down</span>
                  {sv.bearish}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Attachments */}
      {post.attachments.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-text-subtle mb-4">
            Attachments ({post.attachments.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {post.attachments.map((a) => (
              <AttachmentItem key={a.name} a={a} />
            ))}
          </div>
        </section>
      )}

      {/* Vote bar */}
      <div className="flex items-center gap-6 py-6 border-y border-white/10 mb-12">
        <button
          onClick={handleUpvote}
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${
            upvoted ? "text-teal" : "text-text-subtle hover:text-teal"
          }`}
        >
          <span
            className="material-symbols-outlined text-[22px]"
            style={upvoted ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            expand_less
          </span>
          {post.upvotes} upvotes
        </button>
        <span className="text-text-subtle/30">·</span>
        <span className="text-sm text-text-subtle">
          {post.comments.length} comments
        </span>
      </div>

      {/* Comments */}
      <section ref={commentsRef} id="comments">
        <h2 className="text-lg font-display font-bold text-text-primary mb-6">
          Discussion
        </h2>

        {/* Comment form */}
        <form onSubmit={handleComment} className="mb-8">
          <textarea
            placeholder="Add your analysis or question…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-text-primary placeholder-text-subtle focus:outline-none focus:border-teal/50 resize-none leading-relaxed text-sm mb-3"
          />
          <div className="flex md:justify-end">
            <button
              type="submit"
              disabled={!commentBody.trim() || submitting}
              className="w-full md:w-auto justify-center min-h-[44px] md:min-h-0 bg-gradient-to-r from-teal to-teal-deep text-obsidian px-6 py-2 rounded-full font-bold text-sm tracking-wide hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? "Posting…" : "Post reply"}
            </button>
          </div>
        </form>

        {/* Comment list */}
        {post.comments.length === 0 ? (
          <p className="text-text-subtle/50 text-sm">
            No replies yet. Share your take to start the discussion.
          </p>
        ) : (
          <div>
            {post.comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                postId={post.id}
                userAddress={address ?? "anon"}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
