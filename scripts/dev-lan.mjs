#!/usr/bin/env node

/**
 * `npm run dev:lan` — `next dev`, reachable from the owner's phone on the same Wi-Fi.
 *
 * Three things have to be true at once for a phone to see this app, and only the first is free:
 *
 * 1. the server listens on every interface, which `next dev` already does;
 * 2. `allowedDevOrigins` in `next.config.ts` names the address the phone will type — **without it
 *    every `/_next/*` asset answers 403**, the page arrives, nothing hydrates, and the result looks
 *    exactly like the bug under test. That is decision 043's trap (`127.0.0.1` silently testing the
 *    no-JavaScript fallbacks) wearing a different hostname;
 * 3. that variable is in the **shell**, not in `.env.local`. Measured, because it is the kind of
 *    thing one assumes the other way round: `next.config.ts` is evaluated before Next loads the env
 *    files, so a `DEV_LAN_ORIGINS` written there is read as absent and the 403 comes back with no
 *    hint that the value exists.
 *
 * So this script resolves the address itself and hands it to `next dev` in its environment. Nothing
 * to configure, and nothing to correct when the DHCP lease changes — which is the point: a LAN
 * address typed into a committed file is a fact with a shelf life of about a week.
 *
 * `DEV_LAN_ORIGINS=…  npm run dev:lan` still wins, for a second device or a hostname.
 */

import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

/**
 * The address a phone on the same network can reach, or `null`.
 *
 * `internal` drops loopback. The `veth`/`docker`/`br-` filter is not cosmetic on this machine: it
 * carries fourteen bridge addresses, every one of them a non-internal IPv4 that no phone can route
 * to, and the first one `os` happens to list is as likely to be a container bridge as the Wi-Fi.
 */
function lanAddress() {
  const skip = /^(docker|br-|veth|virbr|tun|tap|kube|cni|flannel|lo)/;
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

const origins = process.env.DEV_LAN_ORIGINS ?? lanAddress();

if (!origins) {
  console.error(
    "Aucune adresse LAN trouvée : passe-la toi-même, " +
      "par exemple DEV_LAN_ORIGINS=192.168.1.24 npm run dev:lan",
  );
  process.exit(1);
}

const first = origins.split(",")[0].trim();
console.log(`\n  Sur le téléphone, même Wi-Fi : http://${first}:${process.env.PORT ?? 3000}\n`);

const child = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  env: { ...process.env, DEV_LAN_ORIGINS: origins },
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
