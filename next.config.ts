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

  // Testing on the owner's own phone, against `next dev` on his laptop over the LAN.
  //
  // `next dev` already listens on every interface, so the phone reaches the page — and then gets
  // **403 on every `/_next/*` asset**, because Next 16 refuses a dev request whose `Host` is not one
  // it was told to expect. The page arrives, nothing hydrates, and the failure looks exactly like the
  // bug you were trying to reproduce: this is decision 043's trap (`127.0.0.1` silently testing the
  // no-JavaScript fallbacks) with a different hostname. Measured before this line was written —
  // `curl` of a chunk over the LAN address answered 403 and the dev server printed this very
  // configuration key as the remedy.
  //
  // It is read from the environment rather than written here because the value is one machine's DHCP
  // lease, which the next session cannot inherit and should not have to correct. **Use
  // `npm run dev:lan`**, which resolves the address and sets the variable for you — and note the
  // thing that is easy to assume the other way round: this file is evaluated *before* Next loads
  // `.env.local`, so a `DEV_LAN_ORIGINS` written there reads as absent here and the 403 comes back
  // with nothing to say the value exists. Measured both ways. Comma-separated for a second device.
  // **Development only** — Next ignores it in a production build, and `npm run build` is unaffected
  // whether the variable is set or absent (decision 075: a build must not depend on the environment).
  allowedDevOrigins: (process.env.DEV_LAN_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export default nextConfig;
