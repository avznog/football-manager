import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output only when the Docker build asks for it (decision 076). It is opt-in rather
  // than always on so that Vercel, which does its own tracing, keeps building exactly as it did.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
