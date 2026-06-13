import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // @concordia/shared is a source-only TS workspace package; Next must transpile it.
  transpilePackages: ["@concordia/shared"],
  // The package lives at ../shared (outside web/); Turbopack only resolves files
  // under its root, so point the root at the repo root (parent of web/ and shared/).
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
};

export default nextConfig;
