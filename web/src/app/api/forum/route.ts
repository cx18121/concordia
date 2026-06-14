import { NextResponse } from "next/server";
import { type Post, type Comment, type Attachment, SEED, cloneDeep } from "@/lib/forum-store";

const KV_KEY = "concordia:forum:v1";

// In-memory fallback when KV env vars aren't present (local dev without KV).
// Module-level so it persists for the dev-server session.
let _mem: Post[] | null = null;

async function load(): Promise<Post[]> {
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import("@vercel/kv");
      const posts = await kv.get<Post[]>(KV_KEY);
      return posts ?? cloneDeep(SEED);
    } catch {
      return cloneDeep(SEED);
    }
  }
  if (_mem === null) _mem = cloneDeep(SEED);
  return _mem;
}

async function save(posts: Post[]): Promise<void> {
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.set(KV_KEY, posts);
    } catch {}
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
        delta: "just posted",
        deltaUp: true,
        ts: Date.now(),
      };
      posts.unshift(post);
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
  }

  await save(posts);
  return NextResponse.json(posts);
}
