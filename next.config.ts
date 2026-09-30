import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output only when the Docker build asks for it (decision 076). It is opt-in rather
  // than always on so that Vercel, which does its own tracing, keeps building exactly as it did.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,

  // Next's dev badge floats `bottom-left` by default, which is where game mode's ACTION button now
  // is: the bar used to sit 72 px up to clear the tab bar, and at `bottom-0` the badge lands on the
  // one button a coach taps thirty times a match (decision 112). It is worse than a nuisance when the
  // HMR socket drops — the badge grows into a « connection lost » panel, which is precisely the state
  // `e2e/offline.spec.ts` puts the app in, and Playwright reported the portal intercepting the tap.
  // Every corner of a 393 px phone is occupied, so this is the least bad one: top-left is the team
  // name in the app shell and the back button in game mode, neither of which is tapped in a hurry.
  devIndicators: { position: "top-left" },
};

export default nextConfig;
