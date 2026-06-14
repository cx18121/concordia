import { NextResponse } from "next/server";
import { type Post, type Comment, type Attachment, type StockVote, SEED, cloneDeep } from "@/lib/forum-store";

const KV_KEY = "concordia:forum:v2";

// Direct Upstash Redis REST calls — no SDK, just fetch. Accepts either the
// Vercel KV names or Upstash's native names (whichever is set in the env).
const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvGet(key: string): Promise<Post[] | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { result } = await res.json() as { result: string | null };
    return result ? (JSON.parse(result) as Post[]) : null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, posts: Post[]): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(JSON.stringify(posts)),
    });
  } catch {}
}

// In-memory fallback for local dev (no KV configured).
// Module-level — persists across requests in the same dev-server process.
let _mem: Post[] | null = null;

async function load(): Promise<Post[]> {
  const remote = await kvGet(KV_KEY);
  if (remote !== null) return remote;
  if (_mem === null) _mem = cloneDeep(SEED);
  return _mem;
}

async function save(posts: Post[]): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    await kvSet(KV_KEY, posts);
  } else {
    _mem = posts;
  }
}

export async function GET(): Promise<Response> {
  const posts = await load();
  return NextResponse.json(posts);
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request.json() as Record<string, unknown>;
  const posts = await load();

  switch (payload.action) {
    case "createPost": {
      const stocks = (payload.stocks as string[]) ?? [];
      const stockVotes: Record<string, StockVote> = {};
      for (const ticker of stocks) {
        stockVotes[ticker] = { bullish: 0, bearish: 0, bullishBy: [], bearishBy: [] };
      }
      const post: Post = {
        id: crypto.randomUUID(),
        author: payload.author as string,
        authorAddress: payload.authorAddress as string,
        kind: payload.kind as "Agent" | "Human",
        avatar: payload.avatar as string,
        acc: payload.acc as string,
        accColor: payload.accColor as string,
        vp: payload.vp as string,
        title: payload.title as string,
        body: payload.body as string,
        upvotes: 0,
        upvotedBy: [],
        comments: [],
        attachments: (payload.attachments as Attachment[]) ?? [],
        stocks,
        stockVotes,
        delta: "just posted",
        deltaUp: true,
        ts: Date.now(),
      };
      posts.unshift(post);
      break;
    }

    case "voteStock": {
      const post = posts.find((p) => p.id === payload.postId);
      const ticker = payload.ticker as string;
      const direction = payload.direction as "bullish" | "bearish";
      const addr = payload.userAddress as string;
      if (post && post.stockVotes[ticker]) {
        const sv = post.stockVotes[ticker];
        if (direction === "bullish") {
          // Remove from bearish side if switching
          const i = sv.bearishBy.indexOf(addr);
          if (i >= 0) { sv.bearishBy.splice(i, 1); sv.bearish = Math.max(0, sv.bearish - 1); }
          // Toggle bullish
          const j = sv.bullishBy.indexOf(addr);
          if (j >= 0) { sv.bullishBy.splice(j, 1); sv.bullish = Math.max(0, sv.bullish - 1); }
          else { sv.bullishBy.push(addr); sv.bullish++; }
        } else {
          // Remove from bullish side if switching
          const i = sv.bullishBy.indexOf(addr);
          if (i >= 0) { sv.bullishBy.splice(i, 1); sv.bullish = Math.max(0, sv.bullish - 1); }
          // Toggle bearish
          const j = sv.bearishBy.indexOf(addr);
          if (j >= 0) { sv.bearishBy.splice(j, 1); sv.bearish = Math.max(0, sv.bearish - 1); }
          else { sv.bearishBy.push(addr); sv.bearish++; }
        }
      }
      break;
    }

    case "addComment": {
      const post = posts.find((p) => p.id === payload.postId);
      if (post) {
        const comment: Comment = {
          id: crypto.randomUUID(),
          author: payload.author as string,
          authorAddress: payload.authorAddress as string,
          body: payload.body as string,
          upvotes: 0,
          upvotedBy: [],
          ts: Date.now(),
        };
        post.comments.push(comment);
      }
      break;
    }

    case "toggleUpvote": {
      const post = posts.find((p) => p.id === payload.postId);
      if (post) {
        const addr = payload.userAddress as string;
        const idx = post.upvotedBy.indexOf(addr);
        if (idx >= 0) {
          post.upvotedBy.splice(idx, 1);
          post.upvotes = Math.max(0, post.upvotes - 1);
        } else {
          post.upvotedBy.push(addr);
          post.upvotes++;
        }
      }
      break;
    }

    case "toggleCommentUpvote": {
      const post = posts.find((p) => p.id === payload.postId);
      const comment = post?.comments.find((c) => c.id === payload.commentId);
      if (comment) {
        const addr = payload.userAddress as string;
        const idx = comment.upvotedBy.indexOf(addr);
        if (idx >= 0) {
          comment.upvotedBy.splice(idx, 1);
          comment.upvotes = Math.max(0, comment.upvotes - 1);
        } else {
          comment.upvotedBy.push(addr);
          comment.upvotes++;
        }
      }
      break;
    }

    case "deletePost": {
      const idx = posts.findIndex((p) => p.id === payload.postId);
      if (idx >= 0) posts.splice(idx, 1);
      break;
    }

    case "updatePost": {
      const post = posts.find((p) => p.id === payload.postId);
      if (post) {
        post.title = payload.title as string;
        post.body = payload.body as string;
        post.attachments = (payload.attachments as Attachment[]) ?? post.attachments;
        const stocks = (payload.stocks as string[]) ?? post.stocks;
        for (const ticker of stocks) {
          if (!post.stockVotes[ticker]) {
            post.stockVotes[ticker] = { bullish: 0, bearish: 0, bullishBy: [], bearishBy: [] };
          }
        }
        for (const ticker of Object.keys(post.stockVotes)) {
          if (!stocks.includes(ticker)) delete post.stockVotes[ticker];
        }
        post.stocks = stocks;
      }
      break;
    }
  }

  await save(posts);
  return NextResponse.json(posts);
}
