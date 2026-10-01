# The iPhone trace bookmarklet

A diagnostic you tap into the preview deployment from your phone. It records what the page actually
did — console output, errors, rejected promises, the resolved safe-area inset, and above all **what
`elementFromPoint` returns at the centre of each of the four tab-bar tabs** — and POSTs it to
`/api/dev/trace`, where it comes out in the Vercel logs.

It exists because two things in `docs/ROADMAP.md` (« Two things about the tab bar that only the
owner's phone can answer ») cannot be answered on Linux, in Chromium, or in a screenshot: whether
Safari's own bottom toolbar is eating the first tap on the tab bar, and whether
`html { overflow-x: hidden }` is shifting a `fixed` bar on iOS. Both look identical from the outside
— « sometimes nothing happens » — and they are told apart by which element is really under the pixel
you aimed at.

**This ships no production code.** Nothing here is imported by the app, is in its bundle, or changes
a rendered screen. `capture.js` only ever runs in a tab you injected it into yourself.

## Build it

```bash
node scripts/iphone-trace/build-bookmarklet.mjs
```

It prints the `javascript:` URL to stdout and writes it to **`audit/iphone-trace-bookmarklet.txt`**
(`audit/` is already gitignored, and already where `scripts/audit-screens.ts` puts its output — so
nothing was added to `.gitignore` for this).

It also prints the length and warns above 8 000 characters. The current build is around 14 000, which
is expected: the minifier is deliberately conservative — it strips comments and indentation and
nothing else, because a clever minifier is a bug in a tool whose whole job is to be believed. The
warning is a prompt to check the paste went in whole, not a failure.

Edit `capture.js` and rebuild. Never edit the URL.

## Install it on the iPhone

**A `javascript:` URL cannot be typed or pasted into iOS Safari's address bar.** Safari strips the
scheme on entry; it only honours it from a bookmark. So the install is: make a bookmark of anything,
then replace its address.

1. On the Mac, run the build and copy the URL — the whole thing, from `javascript:` to the end. (If
   you prefer: open `audit/iphone-trace-bookmarklet.txt`, select all, copy.)
2. Get it onto the phone. Easiest is to paste it into a note or an iMessage to yourself; **do not**
   let anything turn it into a tappable link, and do not tap it there — copy it from there.
3. On the iPhone, open Safari on any page and tap **Partager** → **Ajouter un favori**. Name it
   `FM trace`, save it in **Favoris** (so it is one tap away in a new tab), and save.
4. Tap the bookmarks icon (the open book) → **Favoris** → **Modifier** → tap `FM trace`.
5. Clear its **address** field completely and **paste** the URL in. Check the end of it is there by
   scrolling the field — a truncated paste is the one failure that looks like success.
6. **Terminé**. The bookmark is now the tool.

## Use it

1. Open `https://dev.7orteils.bgonzva.fr` and log in. Go to the screen you want to question —
   `/calendrier` is the one the symptom was reported on.
2. Tap the bookmarks icon → **Favoris** → `FM trace`. (From a page with a keyboard open this is
   fiddly; dismiss the keyboard first.)
3. It asks for a name. Say what you are about to do: « tap calendrier après scroll ». That name is
   how you will find this run in the logs.
4. A small dark panel appears just **above** the tab bar — deliberately above it, so it covers no tab
   and clears the home indicator. It shows the entry count, a status line, **Test** and **Envoyer**.
   The panel itself is transparent to taps; only its two buttons take them.
5. One hit-test pass runs immediately, on install. That is the « before » half: Safari's toolbar is
   still expanded, which is the state the first tap of a session lands in.
6. Now **scroll down far enough that Safari's bottom toolbar collapses**, then tap **Test**. That is
   the « after » half. Scroll back up so it expands and tap **Test** again if you like — every pass is
   numbered and they all survive in the same run.
7. Use the app normally in between. Anything the page logs, throws, or rejects is recorded as it
   happens.
8. Tap **Envoyer**. The status line shows the HTTP status: `Envoyé ✓ 202 · 23 entrées` means it
   landed. Anything else means it did not, and says what came back instead.

It also flushes by itself when you background the tab or lock the phone, so a run is rarely lost. It
keeps the **last 200** entries and says so in the payload if it had to drop older ones.

Tapping the bookmark a second time on the same page does **not** install it twice — it just re-shows
the panel. Navigating to another page unloads it; install it again there.

### What the hit test is asserting

The bar is `components/nav/bottom-nav.tsx`: a `fixed bottom-0` `<nav aria-label="Navigation
principale">` with one `<a>` per entry of `NAV_ITEMS`, left to right — **Calendrier · Équipe · Stats ·
Moi**. For each one the trace records the tab's own `getBoundingClientRect()`, the element
`elementFromPoint` returns at the centre of that rect, and that element's tag and label.

Read it as: `expected` and `actualLabel` equal means that tab is genuinely tappable where it is
painted. Anything else is the finding —

- `actualTag: "(null)"`, `actualLabel: "(rien)"` — nothing is there at all. The bar is painted
  somewhere its hit region is not, which is the `overflow-x: hidden` suspicion.
- some other tab's name, or `[autre cible]` — the bar's geometry and its hit regions disagree.
- a label from the page content behind the bar — the bar is not receiving taps in that strip, which
  points at Safari's chrome.
- `(overlay du traceur — à ignorer)` should never appear: the panel is taken out of its own
  measurement. If it does, that line is the tool's fault and not the app's.

The accompanying `note` entry on each pass carries `scrollY`, `innerHeight` and the visual viewport's
height and `offsetTop` — that is how you tell a collapsed toolbar from an expanded one afterwards.

## Read the results

The endpoint logs the payload server-side, so the run comes out of Vercel:

```bash
vercel logs dev.7orteils.bgonzva.fr --project football-manager
```

Find your run by the name you typed at step 3. Keep that command running while you tap, if you want
to watch it arrive.

The payload also carries the device block the rest of these findings keep needing: user agent, DPR,
`screen` and `innerWidth`/`innerHeight`, the visual viewport, the theme as `<html>` actually has it,
whether it is running installed to the home screen, and the **resolved**
`env(safe-area-inset-bottom)` in px.

## When you are done

Nothing to uninstall from the app — there is nothing in the app. Delete the bookmark, or keep it; it
does nothing until it is tapped, and it only ever posts to `/api/dev/trace`, which is not a route
production should be serving.
