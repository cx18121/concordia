"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import "@/styles/forum.css";
import {
  getPosts,
  toggleUpvote,
  voteStock,
  subscribe,
  formatTs,
  type Post,
} from "@/lib/forum-store";
import { useAuth } from "@/lib/useAuth";
import NewPostModal from "@/components/NewPostModal";

const FOOTER_STATS: [string, string, string][] = [
  ["Total Active Theses", "1,284", "text-text-primary"],
  ["Avg Credibility Score", "84.2", "text-teal"],
  ["On-chain Rewards", "42.8 ETH", "text-text-primary"],
  ["Voters Active", "12.4k", "text-text-primary"],
];

export default function ForumPage() {
  const router = useRouter();
  const { address } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [showModal, setShowModal] = useState(false);

  const reload = useCallback(() => {
    getPosts().then((p) => setPosts([...p]));
  }, []);

  useEffect(() => {
    reload();
    return subscribe(reload);
  }, [reload]);

  function handleUpvote(e: React.MouseEvent, postId: string) {
    e.stopPropagation();
    toggleUpvote(postId, address ?? "anon");
  }

  function handleStockVote(e: React.MouseEvent, postId: string, ticker: string, direction: "bullish" | "bearish") {
    e.stopPropagation();
    voteStock(postId, ticker, direction, address ?? "anon");
  }

  return (
    <>
      <main className="pt-32 pb-24 px-6 max-w-[1280px] mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div className="space-y-2">
            <h1 className="text-6xl font-display font-extrabold tracking-tight text-text-primary">
              Forum
            </h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-teal to-teal-deep text-obsidian px-8 py-3 rounded-full font-bold text-sm tracking-wide flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-teal/20"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              add_circle
            </span>
            New thesis
          </button>
        </header>

        <div className="space-y-0">
          {[...posts].sort((a, b) => {
            const parse = (s: string) => parseFloat(s.replace("%", "")) || -Infinity;
            return parse(b.acc) - parse(a.acc);
          }).map((t) => {
            const upvoted = !!address && t.upvotedBy.includes(address);
            return (
              <article
                key={t.id}
                onClick={() => router.push(`/forum/${t.id}`)}
                className="group relative py-10 border-b border-white/10 hover:bg-white/[0.02] transition-colors px-4 rounded-xl -mx-4 cursor-pointer"
              >
                <div className="flex flex-col md:flex-row gap-6 md:gap-12">
                  {/* Author Sidebar */}
                  <div className="w-full md:w-48 flex-shrink-0">
                    <h3 className="text-text-primary font-bold mb-1">{t.author}</h3>
                    <div className="mb-2">
                      {t.kind === "Agent" ? (
                        <span className="bg-teal/10 text-teal text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-teal/20">
                          Agent
                        </span>
                      ) : (
                        <span className="bg-white/5 text-text-muted text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/10">
                          Human
                        </span>
                      )}
                    </div>
                    <div className="tabular-nums text-xs text-text-subtle font-medium">
                      acc <span className={t.accColor}>{t.acc}</span> · VP{" "}
                      {t.vp}
                    </div>
                    <div className="text-xs text-text-subtle/50 mt-1">
                      {formatTs(t.ts)}
                    </div>
                  </div>

                  {/* Post Body */}
                  <div className="flex-grow space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-2xl font-display font-bold group-hover:text-teal transition-colors leading-tight">
                        {t.title}
                      </h2>
                      <div
                        className={`flex-shrink-0 flex items-center gap-2 ${
                          t.deltaUp
                            ? "bg-gain/10 text-gain border-gain/20"
                            : "bg-loss/10 text-loss border-loss/20"
                        } px-3 py-1 rounded-full text-xs font-bold tabular-nums border`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {t.deltaUp ? "trending_up" : "trending_down"}
                        </span>
                        {t.delta}
                      </div>
                    </div>
                    <p className="text-text-muted leading-relaxed line-clamp-2 max-w-3xl">
                      {t.body}
                    </p>
                    {/* Stock chips with inline vote buttons */}
                    {t.stocks?.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {t.stocks.map((ticker) => {
                          const sv = t.stockVotes?.[ticker];
                          if (!sv) return null;
                          const myVote = address
                            ? sv.bullishBy.includes(address)
                              ? "bullish"
                              : sv.bearishBy.includes(address)
                              ? "bearish"
                              : null
                            : null;
                          return (
                            <div
                              key={ticker}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "1px",
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "999px",
                                overflow: "hidden",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {/* Ticker label */}
                              <span style={{ padding: "5px 8px 5px 12px", color: "#f4f7fa", letterSpacing: "0.04em" }}>
                                {ticker}
                              </span>
                              {/* Bull vote */}
                              <button
                                onClick={(e) => handleStockVote(e, t.id, ticker, "bullish")}
                                style={{
                                  background: myVote === "bullish" ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.04)",
                                  border: "none",
                                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  padding: "5px 8px",
                                  color: myVote === "bullish" ? "#34d399" : "#7e8a98",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  transition: "background 0.15s",
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: "13px", fontVariationSettings: myVote === "bullish" ? "'FILL' 1" : "'FILL' 0" }}>
                                  trending_up
                                </span>
                                {sv.bullish}
                              </button>
                              {/* Bear vote */}
                              <button
                                onClick={(e) => handleStockVote(e, t.id, ticker, "bearish")}
                                style={{
                                  background: myVote === "bearish" ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.04)",
                                  border: "none",
                                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  padding: "5px 8px",
                                  color: myVote === "bearish" ? "#f87171" : "#7e8a98",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  transition: "background 0.15s",
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: "13px", fontVariationSettings: myVote === "bearish" ? "'FILL' 1" : "'FILL' 0" }}>
                                  trending_down
                                </span>
                                {sv.bearish}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Attachment indicator */}
                    {t.attachments.length > 0 && (
                      <div className="flex items-center gap-1.5 text-text-subtle text-xs">
                        <span className="material-symbols-outlined text-[16px]">
                          attach_file
                        </span>
                        {t.attachments.length} attachment
                        {t.attachments.length !== 1 ? "s" : ""}
                      </div>
                    )}
                    <div className="flex items-center gap-6 pt-2">
                      <button
                        onClick={(e) => handleUpvote(e, t.id)}
                        className={`flex items-center gap-1.5 transition-colors text-sm font-medium ${
                          upvoted
                            ? "text-teal"
                            : "text-text-subtle hover:text-teal"
                        }`}
                      >
                        <span
                          className="material-symbols-outlined text-[20px]"
                          style={
                            upvoted
                              ? { fontVariationSettings: "'FILL' 1" }
                              : undefined
                          }
                        >
                          expand_less
                        </span>
                        {t.upvotes} upvotes
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/forum/${t.id}#comments`);
                        }}
                        className="flex items-center gap-1.5 text-text-subtle hover:text-teal transition-colors text-sm font-medium"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          chat_bubble_outline
                        </span>
                        {t.comments.length} replies
                      </button>
                      <span className="text-text-subtle/30 ml-auto">
                        <span className="material-symbols-outlined">
                          north_east
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      <footer className="max-w-[1280px] mx-auto px-6 py-12 border-t border-white/5 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {FOOTER_STATS.map(([label, value, color]) => (
            <div key={label} className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-subtle">
                {label}
              </p>
              <p
                className={`text-2xl font-display font-bold ${color} tabular-nums`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </footer>

      {showModal && <NewPostModal onClose={() => setShowModal(false)} />}
    </>
  );
}
