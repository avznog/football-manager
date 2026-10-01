/**
 * The injected half of the iPhone diagnostic tool: a shim the owner taps into the preview
 * deployment from a Safari bookmark, which records what only his phone can answer and POSTs it
 * to `/api/dev/trace`.
 *
 * This file ships **no production code**. Nothing imports it, it is in no bundle, it changes no
 * rendered screen; it only ever exists inside a browser tab the owner deliberately injected it
 * into. That is the same bargain decision 123 approved for instrumentation and the same one the
 * probes in `scripts/` already live under — the difference is that a probe drives a headless
 * browser on Linux, and the two open questions about the tab bar (`docs/ROADMAP.md`, « Two things
 * about the tab bar that only the owner's phone can answer ») cannot be answered on Linux at all.
 *
 * It is written to be read, not to be pasted: `build-bookmarklet.mjs` strips the comments and the
 * indentation and produces the `javascript:` URL. Edit this file, never the URL.
 *
 * Constraints that shape every choice below:
 *
 * - **No bundler, no imports, no dependencies.** It has to survive being one `javascript:` URL in
 *   a bookmark's address field, so it is a single IIFE in plain script syntax. Modern Safari, so
 *   optional chaining and `const` are fine; a module system is not.
 * - **One try/catch around everything.** A bookmarklet that throws leaves the owner with a page
 *   that looks normal and a tool that is silently absent. The repo's one existing inline script —
 *   the theme script in `app/layout.tsx` — has exactly this shape for exactly this reason.
 * - **Idempotent.** A bookmark in Safari is tapped twice as often as once (the first tap is easy to
 *   miss). Installing twice would double-wrap `console`, double-count entries and stack overlays,
 *   so a flag on `window` makes the second tap a no-op that just re-shows the overlay.
 * - **It must never change what it measures.** The overlay sits where it cannot cover a tab, takes
 *   itself out of its own hit test, and the console wrappers always call through to the originals.
 */
(function () {
  try {
    /**
     * Idempotence. If the shim is already installed, the second tap means « I could not tell
     * whether the first one worked » — so re-show the overlay and stop.
     */
    if (window.__fmTrace) {
      window.__fmTrace.show();
      return;
    }

    /** Entries are capped by the server contract at 200. Oldest are dropped first. */
    const MAX_ENTRIES = 200;
    const ENDPOINT = "/api/dev/trace";

    /**
     * `at` on every entry is milliseconds since install, not a wall clock. The useful question in
     * these traces is always « what happened between the tap and the thing that did not happen »,
     * which is an interval; and a monotonic clock cannot be dragged backwards by the phone.
     */
    const startedAt = (window.performance && performance.now()) || 0;
    function now() {
      const t = (window.performance && performance.now()) || 0;
      return Math.round(t - startedAt);
    }

    /**
     * The run's name comes from a `prompt()` because a trace is only worth reading if the owner can
     * say what he was doing: « tap calendrier après scroll » is the whole value of the record.
     * Cancelling still gives a usable run rather than nothing — a clock stamp is a poor label but a
     * discarded capture is worse.
     */
    const asked = window.prompt(
      "Nom de cette capture ? (ce que tu es en train de tester)",
      "",
    );
    const sessionLabel =
      (asked && asked.trim().slice(0, 80)) ||
      "iPhone " + new Date().toISOString().slice(11, 19);

    const entries = [];
    let dropped = 0;

    function push(entry) {
      entry.at = now();
      if (entries.length >= MAX_ENTRIES) {
        entries.shift();
        dropped++;
      }
      entries.push(entry);
      paint();
    }

    function note(message) {
      push({ kind: "note", message: String(message) });
    }

    /**
     * Arguments reach us as anything at all, and a trace that throws while describing a value it
     * was asked to describe is useless. Errors get their message; objects get JSON if JSON will
     * have them, and their bare type if it will not (circular React fibers, DOM nodes).
     */
    function describe(value) {
      try {
        if (typeof value === "string") return value;
        if (value instanceof Error) {
          return value.name + ": " + value.message;
        }
        if (value && typeof value === "object") {
          if (value.nodeType === 1) {
            return "<" + value.tagName.toLowerCase() + ">";
          }
          const json = JSON.stringify(value);
          return json === undefined ? Object.prototype.toString.call(value) : json;
        }
        return String(value);
      } catch {
        return "[indescriptible]";
      }
    }

    function joinArgs(args) {
      const parts = [];
      for (let i = 0; i < args.length; i++) parts.push(describe(args[i]));
      return parts.join(" ").slice(0, 2000);
    }

    /* ---------------------------------------------------------------- console */

    /**
     * `console` is wrapped rather than replaced, and the original is called **first**: whatever the
     * owner would have seen in a tethered Web Inspector he still sees, and if our own bookkeeping
     * throws the message has already gone out. Swallowing output would make the tool worse than no
     * tool — the next session would read a trace and a console that disagree.
     */
    const LEVELS = ["log", "info", "warn", "error", "debug"];
    const originals = {};
    LEVELS.forEach(function (level) {
      const original = console[level];
      if (typeof original !== "function") return;
      originals[level] = original;
      console[level] = function () {
        try {
          original.apply(console, arguments);
        } catch {
          /* a console that refuses is still not our problem to fix */
        }
        try {
          push({ kind: "log", level: level, message: joinArgs(arguments) });
        } catch {
          /* never let recording break the page */
        }
      };
    });

    /* ----------------------------------------------------------- errors */

    /**
     * `window.onerror` rather than `addEventListener("error")`, as specified, and the previous
     * handler is kept and called: Next installs its own error reporting in development builds and
     * eating it would change the app's behaviour, which is the one thing this shim may not do.
     */
    const previousOnError = window.onerror;
    window.onerror = function (message, source, line, column, error) {
      try {
        push({
          kind: "error",
          message: describe(error || message),
          stack: error && error.stack ? String(error.stack).slice(0, 2000) : undefined,
          source: source ? String(source) : undefined,
          line: typeof line === "number" ? line : undefined,
          column: typeof column === "number" ? column : undefined,
        });
      } catch {
        /* ignore */
      }
      if (typeof previousOnError === "function") {
        return previousOnError.apply(window, arguments);
      }
      return false;
    };

    /**
     * A rejected promise is the shape most of this app's failures actually take — a Server Action
     * or an outbox POST, never a synchronous throw — so it gets its own entry kind.
     */
    window.addEventListener("unhandledrejection", function (event) {
      try {
        const reason = event && event.reason;
        push({
          kind: "rejection",
          message: describe(reason),
          stack: reason && reason.stack ? String(reason.stack).slice(0, 2000) : undefined,
        });
      } catch {
        /* ignore */
      }
    });

    /* ------------------------------------------------------------ device */

    /**
     * The resolved bottom inset, in px. It cannot be read from JavaScript directly: `env()` only
     * exists inside a CSS declaration, so the only way to learn the number is to ask the engine to
     * compute one. A fixed, invisible, zero-size element asking for `padding-bottom: env(...)` and
     * read back through `getComputedStyle` gives the px the app's own `safe-pb` utility is getting,
     * which is the number every « the button is 8 px off the edge » finding turns on.
     *
     * `position: fixed` matters: the inset resolves against the viewport, and a probe inside a
     * transformed or clipped subtree can resolve to 0. It is removed immediately — nothing of this
     * is left in the DOM to be screenshotted later.
     */
    function safeAreaBottom() {
      try {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)";
        document.body.appendChild(probe);
        const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
        probe.remove();
        return value;
      } catch {
        return 0;
      }
    }

    /**
     * The theme as the *page* has it, read exactly the way `app/layout.tsx`'s inline theme script
     * writes it: an explicit choice is a `light` or `dark` class on `<html>`, and « system » is the
     * absence of both, decided live by the media query. Reading `localStorage` instead would get
     * the stored preference rather than the pixels on screen, and the pixels are the subject.
     */
    function theme() {
      const root = document.documentElement;
      if (root.classList.contains("dark")) return "dark";
      if (root.classList.contains("light")) return "light";
      return window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    function device() {
      const vv = window.visualViewport;
      return {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio || 1,
        screen: { width: screen.width, height: screen.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        /**
         * `visualViewport` is the one that moves when Safari's toolbar collapses or the keyboard
         * comes up, and the difference between it and `innerHeight` is most of what « the confirm
         * button is under something » means on iOS. Null-guarded because the contract allows null.
         */
        visualViewport: vv
          ? {
              width: vv.width,
              height: vv.height,
              offsetTop: vv.offsetTop,
              scale: vv.scale,
            }
          : null,
        theme: theme(),
        standalone:
          !!navigator.standalone ||
          (window.matchMedia &&
            window.matchMedia("(display-mode: standalone)").matches) ||
          false,
        safeAreaBottom: safeAreaBottom(),
      };
    }

    /* ---------------------------------------------------------- hit test */

    /**
     * The headline measurement, prescribed verbatim in `docs/ROADMAP.md`: `elementFromPoint` at
     * each of the four tab centres, before and after a scroll that collapses Safari's toolbar,
     * recording what it actually returns.
     *
     * The two suspicions it is meant to separate:
     *   1. `viewportFit: "cover"` puts the bar in the strip Safari's own bottom chrome occupies,
     *      so the first tap may be landing on Safari and not on the app.
     *   2. `html { overflow-x: hidden }` is historically bad for `fixed` children on iOS — the bar
     *      may be shifted or detached from where it is painted.
     *
     * Both produce the same symptom (« sometimes nothing happens ») and the same reading here: the
     * element at a tab's own centre is not that tab. They are told apart by *which* element comes
     * back, and by whether the answer changes after the scroll — which is why the raw tag and label
     * are recorded rather than a verdict.
     *
     * The bar is `components/nav/bottom-nav.tsx`: a `fixed inset-x-0 bottom-0 z-40 md:hidden`
     * `<nav aria-label="Navigation principale">` holding one `<a>` per item in `NAV_ITEMS` —
     * Calendrier, Équipe, Stats, Moi, in that order. Queried by the ARIA label rather than by class
     * because Tailwind class strings are the most likely thing in that file to change, and the
     * accessible name is contractual.
     */
    const NAV_SELECTORS = [
      'nav[aria-label="Navigation principale"]',
      "nav.fixed.bottom-0",
    ];

    function findTabs() {
      for (let i = 0; i < NAV_SELECTORS.length; i++) {
        const nav = document.querySelector(NAV_SELECTORS[i]);
        if (!nav) continue;
        const links = nav.querySelectorAll("a[href]");
        if (links.length) return Array.prototype.slice.call(links);
      }
      return [];
    }

    /** The accessible-ish name of whatever came back, enough to recognise it in a log. */
    function labelOf(el) {
      if (!el) return "(rien)";
      const aria = el.getAttribute && el.getAttribute("aria-label");
      if (aria) return aria;
      const text = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) return text.slice(0, 60);
      const href = el.getAttribute && el.getAttribute("href");
      if (href) return "href=" + href;
      return "(sans texte)";
    }

    /**
     * One pass. `pass` is a human string that ends up in each entry's `label` next to the tab name,
     * so « Calendrier · avant scroll » and « Calendrier · après scroll » sit side by side in the log.
     */
    function hitTest(pass) {
      const tabs = findTabs();
      if (!tabs.length) {
        note(
          "Barre d'onglets introuvable (" +
            pass +
            ") — écran large, ou route sans barre (/jeu, /connexion).",
        );
        return;
      }

      /**
       * The overlay is taken out of the measurement for the duration of the pass. If one of its own
       * buttons answered `elementFromPoint` the trace would report a defect this tool had itself
       * created — a false positive, and the worst possible outcome for a tool whose entire job is to
       * settle a suspicion. Belt and braces: `pointer-events: none` here, *and* a containment check
       * on the result below, because a future overlay child might set `pointer-events: auto` itself.
       */
      const restore = overlay ? overlay.style.pointerEvents : null;
      if (overlay) overlay.style.pointerEvents = "none";

      note(
        "Hit test " +
          pass +
          " — scrollY=" +
          Math.round(window.scrollY) +
          ", innerHeight=" +
          window.innerHeight +
          (window.visualViewport
            ? ", vvHeight=" +
              Math.round(window.visualViewport.height) +
              ", vvOffsetTop=" +
              Math.round(window.visualViewport.offsetTop)
            : ""),
      );

      tabs.forEach(function (tab) {
        const rect = tab.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const found = document.elementFromPoint(x, y);

        /**
         * A pass is `found` being the tab or anything inside it — the centre of a tab is over its
         * own `<svg>` or its `<span>` label as often as over the `<a>`, and all three route. So the
         * recorded `actualLabel` is the enclosing tab's name when the point is inside the tab, and
         * the stranger's name when it is not. That keeps « expected === actualLabel » readable as
         * « this tab is tappable » with no interpretation at the server end.
         */
        let actualLabel;
        if (!found) {
          actualLabel = "(rien)";
        } else if (overlay && overlay.contains(found)) {
          actualLabel = "(overlay du traceur — à ignorer)";
        } else if (tab.contains(found) || found === tab) {
          actualLabel = labelOf(tab);
        } else {
          const enclosing = found.closest ? found.closest("a[href],button") : null;
          actualLabel = enclosing
            ? labelOf(enclosing) + " [autre cible]"
            : labelOf(found);
        }

        push({
          kind: "hit-test",
          label: labelOf(tab) + " · " + pass,
          expected: labelOf(tab),
          actualTag: found ? found.tagName.toLowerCase() : "(null)",
          actualLabel: actualLabel,
          rect: {
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          },
        });
      });

      if (overlay) overlay.style.pointerEvents = restore;
    }

    /** How many passes have run, so the owner never has to remember which one he is on. */
    let passCount = 0;
    function runPass() {
      passCount++;
      hitTest("passe " + passCount);
    }

    /* ------------------------------------------------------------- flush */

    let flushing = false;

    function flush(reason) {
      if (flushing) return;
      if (!entries.length) {
        status("Rien à envoyer");
        return;
      }
      flushing = true;
      status("Envoi… (" + reason + ")");

      /**
       * The dropped-entries note is added at flush time rather than when the drop happens: a note
       * pushed into a full buffer would itself evict an entry, and the count is only final now. One
       * more eviction buys the room, so the payload still honours the 1..200 contract.
       */
      const payloadEntries = entries.slice();
      if (dropped > 0) {
        if (payloadEntries.length >= MAX_ENTRIES) payloadEntries.shift();
        payloadEntries.unshift({
          kind: "note",
          at: 0,
          message:
            dropped +
            " entrées plus anciennes ont été abandonnées (limite de 200).",
        });
      }

      const payload = {
        sessionLabel: sessionLabel,
        capturedAt: new Date().toISOString(),
        page: location.pathname + location.search,
        device: device(),
        entries: payloadEntries,
      };

      /**
       * `keepalive: true` is the same transport `lib/match/outbox.ts` uses, and for the same
       * reason: the most interesting flush is the one on `visibilitychange`, when the tab is being
       * backgrounded and an ordinary fetch is cancelled with it.
       */
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then(function (res) {
          /**
           * The status code is shown on screen because there is no console on a phone. « 404 » and
           * « 2xx » are two completely different mornings for the owner, and he has to be able to
           * tell them apart without tethering the thing to a Mac.
           */
          status(
            (res.ok ? "Envoyé ✓ " : "Échec ") +
              res.status +
              " · " +
              payloadEntries.length +
              " entrées",
          );
          if (res.ok) {
            entries.length = 0;
            dropped = 0;
            paint();
          }
        })
        .catch(function (err) {
          status("Réseau KO : " + describe(err));
        })
        .then(function () {
          flushing = false;
        });
    }

    /**
     * Backgrounding the tab is the last moment anything can be sent, and on iOS it is also the most
     * common end of a capture — the owner swipes away or locks the phone. `visibilitychange` is the
     * only event iOS Safari reliably fires there; `unload` and `beforeunload` are not.
     */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && entries.length) {
        flush("hidden");
      }
    });

    /* ----------------------------------------------------------- overlay */

    let overlay = null;
    let counterEl = null;
    let statusEl = null;

    function paint() {
      if (counterEl) {
        counterEl.textContent =
          "Capture · " +
          entries.length +
          (entries.length === 1 ? " entrée" : " entrées") +
          (dropped ? " (+" + dropped + " perdues)" : "");
      }
    }

    function status(text) {
      if (statusEl) statusEl.textContent = text;
    }

    function button(text, onTap) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      /**
       * Inline hex, which the project forbids in app CSS — the design tokens exist so screens stay
       * consistent. This is not a screen: it must be legible over *any* screen in either theme, and
       * it must not depend on a token whose value is part of what is under review. So: near-black
       * panel, white text, one accent. Fixed colours are the point.
       *
       * `pointer-events: auto` re-enables taps on the control itself; the panel around it is
       * `none`, so the only pixels this tool steals from the app are the two buttons.
       */
      b.style.cssText =
        "pointer-events:auto;-webkit-appearance:none;appearance:none;border:1px solid #ffffff59;border-radius:8px;background:#1f6feb;color:#fff;font:600 13px/1 -apple-system,system-ui,sans-serif;padding:9px 12px;margin-left:6px";
      b.addEventListener("click", function (e) {
        e.preventDefault();
        onTap();
      });
      return b;
    }

    function buildOverlay() {
      overlay = document.createElement("div");

      /**
       * Where this sits is a measurement decision, not a taste one. It is bottom-anchored so it is
       * in thumb reach, but lifted clear of the tab bar — `--tabbar-h` is 56 px plus the bar's own
       * `safe-pb` — because a panel over a tab would be a panel over the thing being measured, and
       * `pointer-events: none` protects the hit test but not the owner's own aim. The extra
       * `env(safe-area-inset-bottom)` keeps it off the home indicator.
       *
       * `z-index` above everything the app uses (the bar is `z-40`, action sheets higher) so it is
       * never buried; `pointer-events: none` on the panel so that, button aside, every tap goes
       * straight through to the app exactly as it would without the tool installed.
       */
      overlay.style.cssText =
        "position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);z-index:2147483647;pointer-events:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:12px;border:1px solid #ffffff40;background:#0d1013f2;color:#f4f6f8;font:500 12px/1.3 -apple-system,system-ui,sans-serif;box-shadow:0 6px 24px #0008";

      const left = document.createElement("div");
      left.style.cssText = "flex:1 1 auto;min-width:0";

      counterEl = document.createElement("div");
      statusEl = document.createElement("div");
      statusEl.style.cssText = "opacity:.75;font-size:11px;margin-top:2px";

      left.appendChild(counterEl);
      left.appendChild(statusEl);

      const actions = document.createElement("div");
      actions.style.cssText = "flex:0 0 auto;display:flex";
      actions.appendChild(button("Test", runPass));
      actions.appendChild(
        button("Envoyer", function () {
          flush("bouton");
        }),
      );

      overlay.appendChild(left);
      overlay.appendChild(actions);
      document.body.appendChild(overlay);

      status("« " + sessionLabel + " » · scrolle puis appuie sur Test");
      paint();
    }

    buildOverlay();

    /**
     * The public handle. `show()` is what a second tap on the bookmark reaches; the rest is for a
     * tethered Web Inspector session, where typing `__fmTrace.test()` is faster than aiming at a
     * button.
     */
    window.__fmTrace = {
      test: runPass,
      flush: function () {
        flush("api");
      },
      note: note,
      entries: entries,
      /**
       * The untouched console methods, kept so a tethered session can put them back —
       * `Object.assign(console, __fmTrace.console)` — without reloading the page and losing the
       * state that made the capture worth taking.
       */
      console: originals,
      show: function () {
        if (overlay) overlay.style.display = "flex";
        status("Déjà en place · appuie sur Test ou Envoyer");
      },
    };

    note("Traceur installé : " + sessionLabel);

    /**
     * One pass on install, before any scroll. That is the « before » half of what the roadmap asks
     * for: Safari's toolbar is still expanded, and this is the state the first tap of a session
     * lands in — the one the owner reports as doing nothing. The « after » half is the Test button,
     * once he has scrolled enough to collapse the toolbar.
     *
     * Deferred by a frame so the measurement is taken against a settled layout rather than against
     * the one the overlay was just inserted into.
     */
    requestAnimationFrame(runPass);
  } catch (e) {
    /**
     * Last resort. There is no console to read on the phone, so a failure to install has to say so
     * on screen or it is indistinguishable from a bookmark that did not fire at all.
     */
    window.alert("Traceur KO : " + (e && e.message ? e.message : e));
  }
})();
