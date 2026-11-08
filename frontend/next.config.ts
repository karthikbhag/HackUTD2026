import path from "node:path";
import type { NextConfig } from "next";

// Repository root, so the frontend can import Person 3's pure helpers from backend/src
// (single source of truth). Turbopack does not resolve files outside its root.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
