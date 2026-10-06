# `components/pitch` — the turf pitch

The signature visual of the app: a realistic green pitch with mowing stripes and white markings,
players as numbered kit-coloured discs with the name underneath (decision 014). Used by the
composition editor, live match mode and player profiles.

Everything here is **presentation only**. No state, no drag-and-drop, no data fetching, no
Server Actions. `Pitch`, `PitchPoint`, `PlayerDisc`, `SlotTarget` and `PitchLayout` are Server
Components and ship no JavaScript; only `PositionPicker` is `'use client'`.

---

## The coordinate system

Read this first — everything depends on it.

A position is **two integers in `0..1000`** (permille; integers on purpose, so coordinates never
drift through float maths and compare exactly in tests and in SQL). The pitch is always drawn
**vertically**, and **we always attack upwards**:

```
                    y = 1000   ── the opponent's goal line
   x = 0  |                                              |  x = 1000
   left   |          y =  500   ── the halfway line       |  right
   touch  |                                              |  touch
                    y =    0   ── our own goal line
```

So the goalkeeper sits near `y = 60`, a centre-back near `y = 240`, a striker near `y = 850`.

This is exactly what `positions.default_x/default_y` and `formation_slots.x/y` hold in the
database (`db/reference.ts` is the typed source of that data).

### Converting

`lib/pitch/geometry.ts` owns every conversion. Never open-code one.

| Helper | Use |
|---|---|
| `toSvgPoint({x, y})` | pitch space → SVG `viewBox` units, for markings inside `Pitch` |
| `toPercentPoint({x, y})` | pitch space → `{left, top}` percentages, for HTML markers on top |
| `fromClientPoint({x, y}, box)` | a pointer event back to a clamped integer pitch point — **this is the one the drag-and-drop editor needs**; `box` is the pitch's `getBoundingClientRect()` |
| `clampToPitch`, `isValidPitchPoint` | keep a dragged slot on the pitch |
| `pitchDistance(a, b)` | distance in units of pitch **width**, corrected for the 2:3 aspect ratio, so it matches what the eye sees |
| `MIN_MARKER_DISTANCE` | the minimum `pitchDistance` between two markers (195). Below it, two 48 px discs touch on a 320 px screen. `db/reference.test.ts` enforces it for every built-in formation |

Two render spaces exist because the markings are SVG (they must scale with the pitch) while the
discs are HTML (they must **not** scale: a name has to stay readable and a target tappable at any
pitch size). The playing area is 1000 × 1500 SVG units — a 40 m × 60 m seven-a-side pitch, so
1 unit = 4 cm — surrounded by a 40-unit margin of turf so the goals and the boundary lines are not
clipped. Both spaces derive from the same constants, which is why HTML markers land exactly on the
SVG markings.

### Example: a pointer handler in the editor

```tsx
const box = pitchRef.current!.getBoundingClientRect();
const point = fromClientPoint({ x: event.clientX, y: event.clientY }, box);
// -> { x: 412, y: 688 }, always integers, always on the pitch
```

---

## Design tokens

Colours come from the tokens in `app/globals.css` and are never hardcoded: `--color-turf`,
`--color-turf-stripe`, `--color-line`, `--color-surface`, `--color-border`, `--color-ink`,
`--color-ink-muted`, `--color-accent`, `--color-accent-ink`, `--color-danger`, `--color-warning`
— as utilities, `fill-turf`, `stroke-line`, `bg-surface`, `text-ink`, `ring-accent`…

The one exception is a **team's** `primary_color` / `secondary_color`, which are arbitrary hex
strings from the database and are applied as inline styles. The ink printed on them is
**computed**, not chosen: see below.

---

## Components

### `Pitch`

The turf surface: touchlines, halfway line, centre circle and spot, both penalty areas and goal
areas, both penalty spots, corner arcs, both goals, and mowing stripes. Scales fluidly from a
320 px phone to a large desktop panel through `viewBox` + `preserveAspectRatio`; the box keeps a
fixed aspect ratio so the HTML marker layer stays aligned with the markings.

```ts
type PitchProps = {
  children?: ReactNode;   // markers, positioned with <PitchPoint>
  className?: string;     // outer box: width and margins only, the aspect ratio is fixed
  stripes?: number;       // mowing bands, default 10
  label?: string;         // French accessible name; omitted = decorative, hidden from AT
};
```

### `PitchPoint`

Absolutely positions its children, centred on `(x, y)` in the 0..1000 space. Pointer events are
enabled on it (the marker layer itself lets them through), so wrapping a `<button>` or a drag
handle works.

```ts
type PitchPointProps = {
  x: number;              // 0..1000
  y: number;              // 0..1000
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};
```

### `PlayerDisc`

```ts
type PlayerDiscVariant = "normal" | "selected" | "unavailable" | "ghost";

type PlayerDiscProps = {
  name: string;                  // abbreviated then truncated to fit under the disc
  jerseyNumber?: number | null;  // amateur squads often have none
  primaryColor: string;          // teams.primary_color, hex
  secondaryColor?: string;       // teams.secondary_color, hex — the ring
  variant?: PlayerDiscVariant;   // default "normal"
  size?: "sm" | "md" | "lg";     // default "md" = 48 px
  positionCode?: string;         // added to the accessible name, e.g. « attaquant »
  statusLabel?: string;          // French reason, e.g. « blessé » — accessible name + tooltip
  showName?: boolean;            // default true; the accessible name always keeps it
  className?: string;
};
```

- `unavailable` = injured **or already substituted off**: danger ring, dimmed, plus a cross badge
  so the meaning does not rest on colour alone.
- `ghost` = a planned position not yet confirmed (decision 006): translucent kit colour, dashed
  outline.
- `selected` = picked up or currently selected in the editor: thick accent ring.
- Sizes: `sm` 40 px, `md` 48 px, `lg` 60 px. **`sm` is below the 44 px minimum tap target** — use
  it for read-only pitches only, never as a drop target or a button.
- Long names: `abbreviateName` turns « Jean-Baptiste Dupont » into « J.-B. Dupont » before CSS
  truncation, because the surname is what identifies a player on a crowded pitch.

**Text contrast.** The number's colour is computed by `readableInkOn(primaryColor)`
(`lib/color.ts`): white or black, whichever has the higher WCAG contrast ratio against the
kit colour. A team in yellow gets black, a team in navy gets white. The worst possible kit colour
still reaches ≈ 4.58:1, i.e. WCAG AA for normal text, and this is not the usual
`luminance > 0.5` rule, which leaves mid-tone reds with white text at 4:1.

> **Why not `--color-kit-ink` / `--color-line`?** Those two tokens exist for the same job and the
> disc could use them. Two numbers argue against it here: the pair (`#0b1014`, `#ffffff`) has a
> worst case of 4.42:1 instead of 4.58:1, and `--color-line` changes with the theme, so the label
> on an *unchanged* club colour would change too. Pure white and pure black are the
> theme-independent pair that maximises the floor, so that is what `lib/color.ts` picks between —
> and `components/ui/contrast.ts` (the avatar, the team header) is a thin adapter over the same
> function, so the whole app has one luminance implementation and one threshold.

### `SlotTarget`

An empty formation slot: a dashed outline with the position code inside.

```ts
type SlotTargetState = "idle" | "hovered" | "invalid";

type SlotTargetProps = {
  positionCode: string;         // "MC", "AT"… displayed inside
  state?: SlotTargetState;      // default "idle"
  size?: "sm" | "md" | "lg";    // default "md"
  label?: string;               // overrides the French accessible name
  className?: string;
};
```

`invalid` (wrong squad, player already placed…) is a doubled danger outline — again a shape
difference, not only a colour. The state is decided by the editor; this component has no logic.

### `PitchLayout`

Composes the above: one `PlayerDisc` per filled slot, one `SlotTarget` per empty one.

```ts
type KitColors = { primaryColor: string; secondaryColor?: string };

type PitchPlayer = {
  id: string;                    // team_members.id — React key, echoed back by renderItem
  name: string;
  jerseyNumber?: number | null;
  variant?: PlayerDiscVariant;   // the caller decides what "unavailable" means
  statusLabel?: string;
  kit?: KitColors;               // overrides the team kit, e.g. a goalkeeper's shirt
};

type PitchSlot = {
  id: string;                    // formation_slots.id, or the position code on a profile
  x: number;                     // 0..1000
  y: number;                     // 0..1000
  positionCode: string;
  player?: PitchPlayer | null;   // absent/null → a SlotTarget
  state?: SlotTargetState;       // only used when the slot is empty
};

type PitchLayoutProps = {
  slots: readonly PitchSlot[];
  kit: KitColors;                            // the team's colours
  size?: "sm" | "md" | "lg";
  className?: string;
  pitchLabel?: string;                       // French accessible name for the graphic
  stripes?: number;
  overlay?: ReactNode;                       // above the markers: drag layer, badges…
  renderItem?: (slot: PitchSlot, content: ReactNode) => ReactNode;
};
```

**`renderItem` is the extension point for drag-and-drop.** `PitchLayout` stays pure; the editor
wraps each marker with its own handlers:

```tsx
<PitchLayout
  slots={slots}
  kit={team}
  renderItem={(slot, content) => (
    <button
      type="button"
      aria-label={`Poste ${slot.positionCode}`}
      onPointerDown={(event) => startDrag(slot, event)}
      onPointerUp={() => drop(slot)}
    >
      {content}
    </button>
  )}
  overlay={dragging ? <DragLayer /> : null}
/>
```

Feeding it from the database: map `formation_slots` (or `lineup_slots` joined to them) to
`PitchSlot`, keeping `x`, `y` and `position_code` as they are — no conversion needed, the space is
the same.

### `PositionPicker` — `'use client'`

The player profile picker: the seven positions of `PREFERRED_POSITIONS` — the ones the owner named,
`GB DG DD MC AG AT AD`, which are **not** the codes of any one formation — as tappable targets on the
turf.
Each tap cycles **non souhaité → secondaire → principal → non souhaité**, i.e.
`player_positions.preference` (no row / `secondary` / `primary`). The composition editor is *not*
narrowed with it and still places any of the eleven.

A record written before the list changed may hold `DC`, `MG`, `MD` or `MOC` — after a
`db:reset`, half the demo squad does. Nothing drops such a code — the profile posts the selection's own keys — so the
picker renders those as a small row of removable chips under the legend, derived from `value` like
the grid. One-way: a chip removes, nothing adds one back, and `cyclePosition` is not involved.
Removing the primary leaves the player with no primary rather than promoting a secondary nobody
chose.

A chip prints the position **in full** (« Ailier gauche »), not its code: it is the control that ends
the wish, and WCAG 2.5.3 Label in Name (decision 117) wants its visible text inside « Retirer Ailier
gauche de tes postes souhaités ». Three full names wrap onto several rows at 320 px and overflow
nothing.

```ts
type PositionSelection = Partial<Record<PositionCode, "primary" | "secondary">>;

type PositionPickerProps = {
  value: PositionSelection;                      // missing key = « non souhaité »
  onChange: (next: PositionSelection) => void;   // full next selection; persisting is yours
  singlePrimary?: boolean;                       // default true — demotes the previous primary
  readOnly?: boolean;                            // not this reader's to change: copy says so
  disabled?: boolean;                            // a save is in flight: inert, copy unchanged
  className?: string;
};
```

Under the pitch, when the wishes **are** the reader's (`readOnly` false), one line says what is
currently chosen — `positionsSummaryFr` over the live selection, the very sentence a read-only card
prints as its description, so a player and a coach read the same prose rather than the player reading
a diagram. On a `readOnly` picker the line is omitted: the card above it already carries it, and
printing both said the primary twice, adjacently.

Fully controlled: no state, no database, no Server Action — the profile page owns the value and
saves it through its own `actions.ts`. Real `<button>` elements, so Tab/Enter/Space work, with a
visible focus ring. French `aria-label`s spell out both the current state and what a tap will do
(« Attaquant, poste secondaire — appuyer pour en faire le poste principal »).

Primary and secondary are distinguishable **without colour**: primary is filled with an inner
ring, secondary is hollow with a solid outline, unwanted is a dashed outline — plus a visible
legend. The three shapes read the same for a colour-blind user and in direct sunlight.

The eleven canonical coordinates in `db/reference.ts` are spaced so that the closest pair
(`MC`/`MOC`) is 240 units apart — about 71 px on a 320 px pitch, comfortable for 48 px targets. That
rule is kept for the whole eleven even though the picker now draws eight of them: the composition
editor can place a slot anywhere on the list.

---

## Reference data — `db/reference.ts`

The typed source of the `positions` rows and of the built-in formation templates
(`formations.team_id = null`), which `db/seed.ts` inserts. Safe to import from the UI: it has no
database dependency (its only import from `db/schema.ts` is a type).

- `POSITIONS`, `POSITION_CODES`, `POSITION_BY_CODE`, `positionLabelFr`, `isPositionCode`
- `LINE_LABELS_FR`, `LINE_ORDER`
- `BUILTIN_FORMATIONS`, `formationByLabel`, `DEFAULT_FORMATION_LABEL`
- `formationLabelOf(slots)`, `formationDistribution(slots)`, `FORMATION_SLOT_COUNT`

**Label convention: the leading `1` is the goalkeeper.** `1-3-2-1` = GB + 3 defenders +
2 midfielders + 1 forward = 7. The four groups are the four `line` values in the order
`GB`, `DEF`, `MIL`, `ATT`, so a label is derivable from its slots — `formationLabelOf()` does it
and `db/reference.test.ts` asserts every template agrees with its own label. Empty lines are still
printed, hence `1-3-3-0`.

A `positionCode` may appear twice in one formation — two centre-backs are both `DC`, a double
pivot is two `MC` — exactly as in eleven-a-side notation.

---

## Pure helpers — `lib/pitch/`

| File | Contents |
|---|---|
| `geometry.ts` | the coordinate system, conversions, `pitchDistance`, `MIN_MARKER_DISTANCE` |
| `colors.ts` | `parseHexColor`, `relativeLuminance`, `contrastRatio`, `readableInkOn`, `withAlpha`, `areColorsIndistinguishable` |
| `names.ts` | `abbreviateName` |
| `preferences.ts` | the tri-state tap cycle: `cyclePosition`, `nextPreference`, `primaryPosition`, `preferenceLabelFr` |

Class names are merged with the shared `cn` from `@/components/ui/cn`.

All of them are pure and covered by `*.test.ts` next to the file. `npm run test` runs them.
