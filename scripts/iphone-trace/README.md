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

**This changes no screen and nothing of it reaches the browser on its own.** `capture.js` only ever
runs in a tab you injected it into yourself. One honest qualification: the capture script's text is
committed as `lib/dev/capture-source.ts` and therefore sits in the **server** bundle of
`app/api/dev/trace/route.ts`, because that route serves it — see « Build it ». It is in no client
bundle, it is invisible to `npm run audit:screens`, and it runs only if you fetch it with the key.

## Set the secret first

The endpoint is behind a shared secret, `TRACE_SECRET`, and it **fails closed**: with the variable
unset the route answers 404 to everything, exactly as if it were not deployed. So, once, by hand:

1. Generate a key — `openssl rand -base64 24` is plenty.
2. Add it in Vercel as `TRACE_SECRET`, in the **Preview** environment only. Not Production: the sink
   refuses production whatever the variable says, so a value there would be a value that does nothing
   except exist in a place it can leak from.
3. Redeploy preview (a push to `main`) so the running function sees it.

Keep the same value to hand for the build below — the bookmarklet carries it.

## Build it

```bash
TRACE_SECRET='…' node scripts/iphone-trace/build-bookmarklet.mjs
# or
node scripts/iphone-trace/build-bookmarklet.mjs --secret='…'
```

It refuses to build without a key, and it never prints the key in full — only its length and first
two characters, so you can tell which one an artefact carries. It writes three things:

| | what | tracked? |
|---|---|---|
| `lib/dev/capture-source.ts` | the capture script as a committed TypeScript constant | **yes — commit it** |
| `audit/iphone-trace-loader.txt` | the loader bookmarklet, ~420 characters — **install this one** | no (`audit/` is gitignored) |
| `audit/iphone-trace-bookmarklet.txt` | the whole script inline, ~15 000 characters — the fallback | no |

`lib/dev/capture-source.ts` is committed because `GET /api/dev/trace` serves it and **cannot read
`capture.js` at runtime**: `scripts/` is not part of Vercel's serverless bundle, so a file read would
work on your machine and 500 on preview. **Edit `capture.js`, rerun the build, commit both in the same
commit.** `lib/dev/trace.test.ts` fails if the constant is empty or has lost its markers, which
catches the gross drift and not the subtle kind.

Both artefacts contain the key in clear text. `audit/` is gitignored; do not copy them anywhere else.

Edit `capture.js` and rebuild. Never edit a URL by hand.

## Install it on the iPhone

**A `javascript:` URL cannot be typed or pasted into iOS Safari's address bar.** Safari strips the
scheme on entry; it only honours it from a bookmark. So the install is: make a bookmark of anything,
then replace its address.

Install the **loader** — `audit/iphone-trace-loader.txt`, around 420 characters. It carries the key and
nothing else; the script itself comes from `GET /api/dev/trace?k=…` when you tap it.

1. On the machine you built on, open `audit/iphone-trace-loader.txt`, select all, copy. It is short
   enough to see whole, which is the point of it.
2. Get it onto the phone. Easiest is to paste it into a note or an iMessage to yourself; **do not**
   let anything turn it into a tappable link, and do not tap it there — copy it from there.
3. On the iPhone, open Safari on any page and tap **Partager** → **Ajouter un favori**. Name it
   `FM trace`, save it in **Favoris** (so it is one tap away in a new tab), and save.
4. Tap the bookmarks icon (the open book) → **Favoris** → **Modifier** → tap `FM trace`.
5. Clear its **address** field completely and **paste** the URL in. Check the end is there —
   `(window,document)` — by scrolling the field.
6. **Terminé**. The bookmark is now the tool.

Rebuilding with the same key produces the same loader, so a `capture.js` edit needs **no reinstall**:
the next tap fetches the new script. Only changing the key means redoing the bookmark.

If a tap gives you `Trace KO`, the route did not serve the script. That is one of three things, and it
answers 404 to all three on purpose: the key in the bookmark is not the one in Vercel, `TRACE_SECRET`
is unset on the deployment, or you are on production (where the sink does not exist). Check the Vercel
variable first, then rebuild the loader with the key you actually set.

**If it 404s and you are certain `TRACE_SECRET` is set, retype the value rather than debug it.** The
three cases above are one identical 404 with nothing in the body to tell them apart — that is the
design, not a gap — so from the outside there is no observation that separates « wrong character in the
key » from « sink off ». That makes a mistyped key the first thing to rule out, and the cheapest way to
rule it out is to set the variable again from a fresh `openssl rand`, redeploy, and rebuild the loader
with the same value. Both sides of the comparison are now trimmed, so a stray leading or trailing
newline — the usual casualty of pasting into the dashboard — is no longer a possible cause. A wrong
character still is, and so is whitespace *inside* the key: only the ends are forgiven. A value that is
nothing but whitespace counts as unset, and the sink stays dead.

### The inline fallback

`audit/iphone-trace-bookmarklet.txt` is the whole capture script in the bookmark, ~15 000 characters,
and it depends on nothing but itself — use it if the route is unreachable or the key is not set in
Vercel yet. Install it the same way, with one caveat that has not gone away:

> **Nobody has yet observed iOS Safari accepting a 15 KB bookmark address.** It is expected to work and
> it is untested. A truncated paste is the one failure that looks exactly like success, so scroll to the
> end of the address field and check the last characters are there — `%7D)()%3B` or thereabouts.

That hazard is the entire reason the loader exists, and it applies only here.

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
8. Tap **Envoyer**. The status line shows the HTTP status: `Envoyé ✓ 200 · 23 entrées` means it
   landed. A `404 · clé refusée, absente, ou sink éteint` is the gate, not a bug — the endpoint refuses
   to say which of the three it is. Anything else says what came back instead.

It also flushes by itself when you background the tab or lock the phone, so a run is rarely lost. It
keeps the **last 200** entries and says so in the payload if it had to drop older ones.

Tapping the bookmark a second time on the same page does **not** install it twice — it just re-shows
the panel. The loader checks the same `window.__fmTrace` flag the script sets, so a double tap costs
one request at most. Navigating to another page unloads it; tap it again there.

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

Nothing to uninstall from the app. Delete the bookmark, or keep it; it does nothing until it is
tapped, and it only ever talks to `/api/dev/trace`, which production does not serve.

To close the channel for good, remove `TRACE_SECRET` from Vercel's preview environment: the gate fails
closed, so the endpoint goes dead on the next deployment without a code change. Rotating the key is the
same move — change it in Vercel, rebuild the loader, replace the bookmark's address.
