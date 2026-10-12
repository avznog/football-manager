# Matches 1–3 of the season — transcription of the owner's paper sheets

Transcribed from three photographs the owner took of his handwritten notebook, supplied as
`~/Downloads/matches/game1.jpeg`, `game2.jpeg` and `game3.jpeg` (read in that order, and treated as
matches 1, 2 and 3 in that order — only the first sheet carries a title, « 1er Match », the other two
are untitled and their ordering rests on the filenames). **None of this has been imported yet.** It is
written down here so that a later script can be written directly from it, the way
`scripts/import-radarlocal.mts` was written from `audit/radarlocal/`. Everything below is what the
paper says; everything the paper does not say is either marked `**UNCERTAIN:**` in place or listed
under « Open questions for the owner » at the end. Nothing has been inferred into a fact.

**The one thing to know before reading on: these sheets record positions and minutes, and almost
nothing else.** No sheet carries a date, an opponent, a home/away, a competition or a final score, and
only the third records a goal. That matters much less than it first appeared, because **each sheet is a
match production already has** — see the next section, where the squads identify all three — so the
missing facts are already in the database. What the sheets carry that the database does not is
**where every player stood, minute by minute**, which is the whole point of them.

## What these sheets are for, and which match each one is

**The owner's purpose, in his words (2026-10-12):** « All of these information are only for the
positions and substitutions on the field. The goal will later be to put them in the past matches, so we
have a record of everyone's position at all time. » So the sheets are not a match report to import as a
new match. They are the **position record for matches that already exist in production**, and the goals
and scores on them matter only where production has none.

**Each sheet is identified by its squad, and the match it names is not a guess.** Comparing the players
each sheet puts on the pitch against the players production records as having played:

| sheet | production match | squad |
| --- | --- | --- |
| `game1.jpeg` (« 1er Match ») | **Galacticos de Balard**, 22/09, `finished`, 3–9 | **identical**, 11 for 11 |
| `game2.jpeg` | **FC Hexagone**, 29/09, `finished`, 3–2 | **identical**, 10 for 10 |
| `game3.jpeg` | **Bayern Barbecue Club**, 06/10, `live`, 9 events, no stats | matches neither of the other two, and this is the only other played match |

That answers, from data rather than from the owner, what no sheet says: the dates, the opponents, the
home/away, the competition and — for the first two — the scores. They came from the RadarLocal import
(decision 147 and the import script).

**The two things the sheets add that production does not have, and one of them is a contradiction:**

1. **Positions over time.** Production has **zero `POSITION_CHANGE` events, in any match.** The
   RadarLocal export recorded substitutions as pairs with no position, so the import gave each
   incoming player the slot of the player he replaced. Every move the paper records — and match 1 alone
   has a dozen, including four different goalkeepers — is simply absent.
2. **Therefore production's goalkeeper minutes for match 1 are wrong.** It says two keepers, Nicolas
   30′ and Léo M 30′. The paper says **Léo M 0′–11′, Samuel 11′–30′, Thomas 30′–40′, Lucas 40′–51′,
   Léo M 51′–end**. Nicolas never keeps goal on the paper at all. `gk_minutes`, `gk_clean_minutes` and
   `conceded_while_gk` all rest on that, and so does the « Gardiens » section of `/stats` and the
   goalkeeper slot of every équipe type.

**Match 3 is the other case:** Bayern Barbecue Club is still `live` in production with 9 events and no
final whistle, so the sheet is the only record of what happened — including its goals.

## How to read the sheets, and why that reading is the one used below

Each sheet is a sequence of **blocks**. A block is the seven players on the pitch, drawn as four lines,
with a minute written just to its right and a vertical column of the players who were **not** on the
pitch beside that minute. The four lines, top to bottom, are:

```
                 ·                     one name
        ·        ·        ·            three names, left / centre / right
             ·       ·                 two names
                 ·                     one name
```

That is `1-3-2-1` read downwards, which is the repo's `1-2-3-1` read **upwards**: the sheet is drawn
with the opponent's goal at the top. So:

| line on the sheet | position | code |
| --- | --- | --- |
| top, one name | attaquant | `AT` |
| second, leftmost of three | ailier (left side) | `AIL` |
| second, centre of three | milieu central | `MC` |
| second, rightmost of three | ailier (right side) | `AIL` |
| third, two names | défenseurs centraux | `DC` ×2 |
| bottom, one name | gardien | `GB` |

The alternative reading — goalkeeper at the top — would put the three midfielders between the keeper
and the two defenders, which is not a shape, so the orientation is not really in doubt. It is also
confirmed by the sheets themselves: on sheet 2 the bottom name is Lucas for every first-half block and
Samuel for every second-half block (a half-time keeper change), and on sheet 3 the bottom name is
Samuel in all nine blocks (one keeper all match) — while the *top* name changes every few minutes and
is twice a player who has just been substituted on.

The left/right of the two `AIL` names is recorded below as information only: `AIL` is one position and
the two sides are deliberately not told apart (decisions 157/158). Same for the two `DC`. Where this
file says « AIL (left) » it is reporting the horizontal place on the paper, nothing more.

The owner writes no French position labels anywhere on these sheets — **there is no « ailier droit »
or « milieu » to quote verbatim.** The position is expressed purely by where the name sits in the
drawing. The only French words on the sheets that are data are the goal lines on sheet 3 (« But »,
« Passe », « But pris ») and sheet 3's notes, quoted verbatim in their own section.

Between the blocks the owner writes single substitution lines in the form

```
47' -> Charles ↗ Benjamin ↘
```

**Read as: the first name comes on, the second name comes off.** This is not a guess: on sheet 2 the
line `18' -> Clément ↗ Pierre ↘` sits between a block where Clément is on the bench and Pierre on the
pitch, and a block where Clément is on the pitch and Pierre on the bench.

**The blocks and the substitution lines do not fully agree, and that is the central problem for an
import.** A block is a complete snapshot and usually differs from the previous one by two, three or
four players, while the substitution lines only ever record one change each. Some block-to-block
changes therefore have no substitution line, and on sheet 2 one player (Charles) is recorded as going
off at 48′ and then appears on the pitch in the 54′ block with no line bringing him back. Both facts
are reported in place below. This file deliberately does **not** resolve them.

Throughout, **« Sam » on the paper is the squad's `Samuel`** — sheet 1 writes « Sam » in the blocks and
« Samuel » in two bench columns and in its 56′ substitution line, for the same player. « Léo M » is
`Léo M` (Léo Montpre), per `OLD_TO_TARGET_DISPLAY_NAME` in `scripts/import-radarlocal.mts`. Every other
name on the three sheets matches a display name in that map exactly: Benjamin, Benoît, Charles,
Clément, Édouard, Lucas, Lucien, Maxime, Nicodème, Nicolas, Pierre, Rémi, Thomas. **No « Léo C » and no
« Raphaël » appear on any of the three sheets.**

---

## Match 1 — sheet `game1.jpeg`, titled « 1er Match »

**This is Galacticos de Balard, 22/09/2026, away, Coupe Automne, lost 3–9** — identified by its squad,
which is production's eleven exactly. **Fully verified by the owner on 2026-10-12.**

- **Date, opponent, home/away, competition, score:** none on the sheet; all in production, from the
  RadarLocal import.
- **Periods / duration:** not stated. The minutes run 0′ → 56′ continuously and the sheet's two columns
  split at 30′ (left column 0′/11′/20′, right column 30′/36′/40′), which is consistent with 2×30 and
  continuous minutes, but the sheet never says so.
- **Squad: 11 players.** Samuel, Benjamin, Thomas, Pierre, Lucas, Nicolas, Léo M, Charles, Clément,
  Rémi, Benoît. Every block has 7 on the pitch and 4 beside it, totalling 11, in all six blocks.

### Starting seven (block « 0′ »)

| position | player | place in the drawing |
| --- | --- | --- |
| `AT` | Samuel | top |
| `AIL` | Benjamin | second line, left |
| `MC` | Thomas | second line, centre |
| `AIL` | Pierre | second line, right |
| `DC` | Lucas | third line, left |
| `DC` | Nicolas | third line, right |
| `GB` | Léo M | bottom |

Not on the pitch at 0′: Charles, Clément, Rémi, Benoît.

### The blocks, in order

Each table is the complete seven at the minute written on the paper. The « changes from the previous
block » line is computed here from the two snapshots and is **not** written on the sheet.

**Block 11′** — **UNCERTAIN:** the minute has another number scribbled over it before « 11 »; the
surviving figure reads `11`.

| position | player |
| --- | --- |
| `AT` | Rémi |
| `AIL` (left) | Benoît |
| `MC` | Nicolas |
| `AIL` (right) | Clément |
| `DC` | Léo M |
| `DC` | Thomas |
| `GB` | Samuel |

Off the pitch: Lucas, Benjamin, Pierre, Charles.
Changes from 0′: **off** Lucas, Benjamin, Pierre — **on** Rémi (`AT`), Benoît (`AIL` left), Clément
(`AIL` right). **Positions moved without a substitution:** Samuel `AT` → `GB`, Léo M `GB` → `DC`,
Thomas `MC` → `DC`, Nicolas `DC` → `MC`. No substitution line on the sheet records any of this.

**Block 20′**

| position | player |
| --- | --- |
| `AT` | Rémi |
| `AIL` (left) | Charles |
| `MC` | Benjamin |
| `AIL` (right) | Pierre |
| `DC` | Léo M |
| `DC` | Lucas |
| `GB` | Samuel |

Off the pitch: Clément, Benoît, Nicolas, Thomas.
Changes from 11′: **off** Benoît, Nicolas, Clément, Thomas — **on** Charles (`AIL` left), Benjamin
(`MC`), Pierre (`AIL` right), Lucas (`DC`). No substitution line records them.

**Block 30′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Benoît |
| `MC` | Pierre |
| `AIL` (right) | Clément |
| `DC` | Nicolas |
| `DC` | Lucas |
| `GB` | Thomas |

Off the pitch: Samuel, Léo M, Benjamin, Rémi.
Changes from 20′: **off** Rémi, Benjamin, Léo M, Samuel — **on** Charles (`AT`), Benoît (`AIL` left),
Clément (`AIL` right), Nicolas (`DC`), Thomas (`GB`); Pierre moves `AIL` → `MC`. **Goalkeeper change:
Samuel → Thomas.** No substitution line records them. If the match is 2×30 this is the half-time
restart.

**Block 36′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Benjamin |
| `MC` | Pierre |
| `AIL` (right) | Clément |
| `DC` | Nicolas |
| `DC` | Lucas |
| `GB` | Thomas |

Off the pitch: Samuel, Léo M, Rémi, Benoît.
Changes from 30′: **off** Benoît — **on** Benjamin, at the same `AIL` (left) place. A clean one-for-one
swap, but no substitution line records it.

**Block 40′**

| position | player |
| --- | --- |
| `AT` | Samuel |
| `AIL` (left) | Benjamin |
| `MC` | Thomas |
| `AIL` (right) | Rémi |
| `DC` | Nicolas |
| `DC` | Léo M |
| `GB` | Lucas |

Off the pitch: Charles, Pierre, Clément, Benoît.
Changes from 36′: **off** Charles, Pierre, Clément — **on** Samuel (`AT`), Rémi (`AIL` right), Léo M
(`DC`); Thomas moves `GB` → `MC` and Lucas moves `DC` → `GB`. **Goalkeeper change: Thomas → Lucas.**
No substitution line records them.

**Block 47′ — derived, not drawn on the sheet.** The owner confirmed the 47′ line and the position it
took (2026-10-12): Charles on for Benjamin, at `AIL`. Benjamin held `AIL` (left) in the 40′ block, so
that is the slot.

| position | player |
| --- | --- |
| `AT` | Samuel |
| `AIL` (left) | **Charles** |
| `MC` | Thomas |
| `AIL` (right) | Rémi |
| `DC` | Nicolas |
| `DC` | Léo M |
| `GB` | Lucas |

Off the pitch: Benjamin, Pierre, Clément, Benoît.
Changes from 40′: **off** Benjamin — **on** Charles, at `AIL` (left). A one-for-one swap, nobody moves.

**Block 48′ — derived, not drawn on the sheet.** The owner confirmed the 48′ line and its position:
Pierre on for Rémi, at `AIL`. Rémi held `AIL` (right), so that is the slot.

| position | player |
| --- | --- |
| `AT` | Samuel |
| `AIL` (left) | Charles |
| `MC` | Thomas |
| `AIL` (right) | **Pierre** |
| `DC` | Nicolas |
| `DC` | Léo M |
| `GB` | Lucas |

Off the pitch: Benjamin, Rémi, Clément, Benoît.
Changes from 47′: **off** Rémi — **on** Pierre, at `AIL` (right). A one-for-one swap, nobody moves.

**Block 51′**

| position | player |
| --- | --- |
| `AT` | Samuel |
| `AIL` (left) | Pierre |
| `MC` | Charles |
| `AIL` (right) | Clément |
| `DC` | Nicolas |
| `DC` | Thomas |
| `GB` | Léo M |

Off the pitch: Lucas, Benjamin, Benoît, Rémi — plus one further bench line scribbled out illegibly.

**This block was the messiest thing on the three sheets, and the 47′ and 48′ blocks above now explain
it.** The owner confirmed the reading (2026-10-12). What the paper shows is a name struck through at
`MC` with « Charles » written underneath, and « Clément » written on top of another name at `AIL`
(right) — and the derivation accounts for both: Charles arrived at `AIL` (left) at 47′ and moves to
`MC` here, and Rémi, whom the struck name under « Clément » resembled, had gone off at 48′. The
overwrites are the owner correcting the drawing as the changes happened, not two players at one post.

Changes from 48′: **off** Lucas — **on** Clément (`AIL` right); Pierre `AIL` (right) → `AIL` (left),
Charles `AIL` (left) → `MC`, Thomas `MC` → `DC`, Léo M `DC` → `GB`. **Goalkeeper change: Lucas → Léo
M.** No substitution line records the Clément-for-Lucas change.

**Block 56′ — derived, not drawn on the sheet.** The owner confirmed the 56′ line (2026-10-12): Rémi on,
Samuel off. He gave no position, and Samuel held `AT`, so a one-for-one swap puts Rémi there — the same
reading the line already implied.

| position | player |
| --- | --- |
| `AT` | **Rémi** |
| `AIL` (left) | Pierre |
| `MC` | Charles |
| `AIL` (right) | Clément |
| `DC` | Nicolas |
| `DC` | Thomas |
| `GB` | Léo M |

Off the pitch: Lucas, Benjamin, Benoît, Samuel.
Changes from 51′: **off** Samuel — **on** Rémi, at `AT`. A one-for-one swap, nobody moves.

### Substitution lines written on the sheet

All three are **confirmed by the owner** (2026-10-12), positions included, and each is drawn out as a
block above.

| minute | on | off | position taken |
| --- | --- | --- | --- |
| 47′ | Charles | Benjamin | `AIL` — the owner said so; Benjamin held `AIL` (left), so that is the slot |
| 48′ | Pierre | Rémi | `AIL` — the owner said so; Rémi held `AIL` (right), so that is the slot |
| 56′ | Rémi | Samuel | `AT` — no position given, and Samuel held `AT`, so a one-for-one swap |

**The three struck-out lines are corrections, not missing changes.** Two sit around the 47′/48′ lines
and one above the 56′ line, and none can be read. The owner's « rest is all verified for this match »
covers the blocks and the three lines above, which together account for every player on and off the
pitch from 0′ to 56′ with nobody unaccounted for — so the struck lines are earlier attempts at the
same changes. That is an inference from completeness, not something he said in those words.

### Goals

**None recorded.** The sheet has no scorer, no assist, no conceded-goal minute and no score.

### Sanity check

**Not possible.** No goals are listed and no final score is stated, so there is nothing to add up and
nothing to add it up against.

### Anything else on the sheet

Nothing. No injuries, no cards, no penalties, no remarks, no man of the match, no ratings, no
supporters list. The bench columns are the only record of who did not play at a given moment, and
every one of the 11 named players appears on the pitch in at least one block.

---

## Match 2 — sheet `game2.jpeg`, untitled

**This is FC Hexagone, 29/09/2026, at home, Coupe Automne, won 3–2** — identified by its squad, which
is production's ten exactly. Its blocks and lines have **not** been through the pass the owner gave
match 1, and two of them disagree (the 48′ line against the 54′ block).

- **Date, opponent, home/away, competition, score:** none on the sheet; all in production, from the
  RadarLocal import.
- **Periods / duration:** not stated. Minutes run 0′ → 54′ continuously; the 30′ block looks like the
  second-half restart, consistent with 2×30.
- **Squad: 10 players.** Samuel, Clément, Maxime, Pierre, Nicolas, Lucien, Lucas, Charles, Nicodème,
  Édouard. Every block has 7 on the pitch and 3 beside it, in all six blocks. **One player fewer than
  matches 1 and 3, and a different cast: no Benjamin, no Thomas, no Rémi, no Benoît, no Léo M.**

### Starting seven (block « 0′ »)

| position | player | place in the drawing |
| --- | --- | --- |
| `AT` | Samuel | top |
| `AIL` | Clément | second line, left |
| `MC` | Maxime | second line, centre |
| `AIL` | Pierre | second line, right |
| `DC` | Nicolas | third line, left |
| `DC` | Lucien | third line, right |
| `GB` | Lucas | bottom |

Not on the pitch at 0′: Charles, Nicodème, Édouard, plus one scribbled-out bench line.

**UNCERTAIN:** there is a name struck out directly underneath « Clément » in the `AIL` (left) slot, and
a struck-out line in the bench column between « Nicodème » and « Édouard ». Neither is legible. They
look like one correction made twice (a player moved from the pitch to the bench or the reverse) but the
sheet does not say, and « Clément » is the name that survives in the slot.

### The blocks, in order

**Block 11′** — **UNCERTAIN:** another number is scribbled over before « 11 »; the surviving figure
reads `11`.

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Édouard |
| `MC` | Maxime |
| `AIL` (right) | Pierre |
| `DC` | Nicodème |
| `DC` | Lucien |
| `GB` | Lucas |

Off the pitch: Samuel, Clément, Nicolas.
Changes from 0′: **off** Samuel, Clément, Nicolas — **on** Charles (`AT`), Édouard (`AIL` left),
Nicodème (`DC`). **Three one-for-one swaps, each into the exact slot of the player who came off**, and
nobody else moves. The cleanest block transition on any of the three sheets. No substitution line
records them.

**Block 22′**

| position | player |
| --- | --- |
| `AT` | Samuel |
| `AIL` (left) | Charles |
| `MC` | Édouard |
| `AIL` (right) | Clément |
| `DC` | Nicolas |
| `DC` | Nicodème |
| `GB` | Lucas |

Off the pitch: Lucien, Pierre, Maxime.

**UNCERTAIN:** the `AIL` (right) slot has « Édouard » struck through with « Clément » written
underneath — and « Édouard » also appears, not struck, in the `MC` slot of the same block. Read as:
the owner wrote Édouard in the wrong slot, struck it, and the midfield line is Charles / Édouard /
Clément. The struck name is clearly legible as Édouard; what is uncertain is only the intent.

Changes from 11′, after the 18′ line below is applied: **off** Maxime, Lucien — **on** Samuel (`AT`),
Nicolas (`DC`); Charles moves `AT` → `AIL` (left) and Édouard moves `AIL` (left) → `MC`. No
substitution line records these two.

**Block 30′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Pierre |
| `MC` | Lucas |
| `AIL` (right) | Maxime |
| `DC` | Nicolas |
| `DC` | Lucien |
| `GB` | Samuel |

Off the pitch: Édouard, Nicodème, Clément.
Changes from 22′, after the 26′ line below is applied: **off** Édouard, Nicodème — **on** Maxime (`AIL`
right), Lucien (`DC`); Charles moves `AIL` (left) → `AT`, Pierre moves `AIL` (right) → `AIL` (left),
Lucas moves `GB` → `MC`, Samuel moves `AT` → `GB`. **Goalkeeper change: Lucas → Samuel**, and Samuel stays in goal
for the rest of the sheet. No substitution line records any of this.

**Block 40′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Édouard |
| `MC` | Nicolas |
| `AIL` (right) | Clément |
| `DC` | Nicodème |
| `DC` | Lucien |
| `GB` | Samuel |

Off the pitch: Lucas, Maxime, Pierre.
Changes from 30′, after the 37′ line below is applied: **off** Lucas, Maxime — **on** Édouard (`AIL`
left), Nicodème (`DC`); Nicolas moves `DC` → `MC`, Clément moves `AIL` (left) → `AIL` (right). No
substitution line records these two.

**Block 54′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Pierre |
| `MC` | Maxime |
| `AIL` (right) | Édouard |
| `DC` | Nicodème |
| `DC` | Lucas |
| `GB` | Samuel |

Off the pitch: Clément, Nicolas, Lucien.

**UNCERTAIN, and it is a contradiction rather than a reading problem.** Applying the four
substitution lines at 48′ and 52′ to the 40′ block gives, at 52′: Pierre, Édouard, Maxime, Clément,
Lucas, Nicodème, Samuel on the pitch and Charles, Nicolas, Lucien off it. The 54′ block differs from
that by exactly one pair: **Charles is on the pitch (at `AT`) and Clément is off it**, the reverse of
the derived state. So either Charles came back on for Clément between 52′ and 54′ with no line
recording it, or the 48′ line « Pierre ↗ Charles ↘ » does not mean what every other line means. The
sheet does not say which, and this file does not choose.

Changes from 40′, after the 48′ and 52′ lines: **off** Nicolas, Lucien, Clément — **on** Pierre (`AIL`
left), Maxime (`MC`), Lucas (`DC`), Charles (`AT`, see above); Édouard moves `AIL` (left) → `AIL`
(right), Nicodème stays `DC`.

### Substitution lines written on the sheet

| minute | on | off | position taken |
| --- | --- | --- | --- |
| 18′ | Clément | Pierre | **UNCERTAIN:** no position on the line. Pierre was `AIL` (right) in the 11′ block, and Clément is at `AIL` (right) in the 22′ block, so `AIL` (right). |
| 26′ | Pierre | Clément | **UNCERTAIN:** Clément was `AIL` (right) at 22′; Pierre is `AIL` (left) in the 30′ block. |
| 37′ | Clément | Pierre | **UNCERTAIN:** Pierre was `AIL` (left) at 30′; Clément is `AIL` (right) in the 40′ block. |
| 48′ | Lucas | Nicodème | **UNCERTAIN:** Nicodème was `DC` at 40′, and Lucas is `DC` in the 54′ block. But see 52′ below — Nicodème is recorded as coming back on four minutes later. |
| 48′ | Pierre | Charles | **UNCERTAIN:** Charles was `AT` at 40′ and is `AT` again in the 54′ block; Pierre is `AIL` (left) there. See the contradiction noted under the 54′ block. |
| 48′ | Maxime | Nicolas | **UNCERTAIN:** Nicolas was `MC` at 40′, and Maxime is `MC` in the 54′ block. |
| 52′ | Nicodème | Lucien | **UNCERTAIN:** Lucien was `DC` at 40′, and Nicodème is `DC` in the 54′ block. |

The three lines at 48′ are written one under another in that order; the sheet gives no finer ordering
than « all three at 48′ ». (`import-radarlocal.mts` had the same problem and settled it by taking the
written order as the data.)

**UNCERTAIN:** one substitution line between the 26′ line and the 30′ block is struck out completely
and cannot be read, including its minute.

### Goals

**None recorded.** No scorer, no assist, no conceded-goal minute, no score.

### Sanity check

**Not possible.** No goals listed, no final score stated.

### Anything else on the sheet

Nothing. No injuries, no cards, no penalties, no remarks, no man of the match, no ratings, no
supporters list. All 10 named players appear on the pitch in at least one block.

---

## Match 3 — sheet `game3.jpeg`, untitled

This is the only sheet with goals on it, and it is also the only one whose top third is not match data
at all but a page of the owner's notes about **features for the app**, transcribed in its own section
below.

**This is Bayern Barbecue Club, 06/10/2026, away, Coupe Automne** — the only played match left once
sheets 1 and 2 are identified by their squads. **It is still `live` in production**, with 9 events, no
final whistle and no frozen statistics, so this sheet is the only record of what happened in it, goals
included.

- **Date, opponent, home/away, competition:** not on the sheet; in production.
- **Final score:** **not written anywhere, and not in production either** — the match was never
  finished there. The goal lists imply 2–5 (see the sanity check).
- **Periods / duration:** not stated. Minutes run 0′ → 59′ continuously, and the 30′ block looks like
  the second-half restart. Consistent with 2×30, never stated.
- **Squad: 11 players.** Charles, Benjamin, Maxime, Pierre, Lucien, Nicodème, Samuel, Rémi, Lucas,
  Thomas, Clément. 7 + 4 = 11 in all nine blocks.
- **Samuel is `GB` in every one of the nine blocks**, so he was in goal for the whole match and for
  every conceded goal.

### Starting seven (block « 0′ »)

| position | player | place in the drawing |
| --- | --- | --- |
| `AT` | Charles | top |
| `AIL` | Benjamin | second line, left |
| `MC` | Maxime | second line, centre |
| `AIL` | Pierre | second line, right |
| `DC` | Lucien | third line, left |
| `DC` | Nicodème | third line, right |
| `GB` | Samuel | bottom |

Not on the pitch at 0′: Rémi, Lucas, Thomas, Clément.

### The blocks, in order

**Block 10′** — **UNCERTAIN:** another number is scribbled over before « 10 »; the surviving figure
reads `10`.

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Rémi |
| `MC` | Lucas |
| `AIL` (right) | Pierre |
| `DC` | Lucien |
| `DC` | Thomas |
| `GB` | Samuel |

Off the pitch: Clément, Benjamin, Maxime, Nicodème.
Changes from 0′: **off** Benjamin, Maxime, Nicodème — **on** Rémi (`AIL` left), Lucas (`MC`), Thomas
(`DC`). Three one-for-one swaps into the exact slots vacated; nobody else moves. No substitution line
records them.

**Block 19′**

| position | player |
| --- | --- |
| `AT` | Benjamin |
| `AIL` (left) | Clément |
| `MC` | Maxime |
| `AIL` (right) | Thomas |
| `DC` | Lucien |
| `DC` | Nicodème |
| `GB` | Samuel |

Off the pitch: Charles, Lucas, Pierre, Rémi.
Changes from 10′: **off** Charles, Rémi, Pierre, Lucas — **on** Benjamin (`AT`), Clément (`AIL` left),
Maxime (`MC`), Nicodème (`DC`); **Thomas moves `DC` → `AIL` (right) without a substitution.** No
substitution line records any of this.

**Block 30′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Rémi |
| `MC` | Maxime |
| `AIL` (right) | Pierre |
| `DC` | Nicodème |
| `DC` | Lucas |
| `GB` | Samuel |

Off the pitch: Benjamin, Clément, Lucien, Thomas.
Changes from 19′: **off** Benjamin, Clément, Thomas, Lucien — **on** Charles (`AT`), Rémi (`AIL` left),
Pierre (`AIL` right), Lucas (`DC`). No substitution line records them. If the match is 2×30 this is the
second-half restart.

**Block 47′** — **UNCERTAIN:** another number is scribbled over before « 47 »; the surviving figure
reads `47`.

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Clément |
| `MC` | Maxime |
| `AIL` (right) | Pierre |
| `DC` | Nicodème |
| `DC` | Thomas |
| `GB` | Samuel |

Off the pitch: Lucas, Benjamin, Rémi, Lucien.
Changes from 30′, after the 37′, 39′, 39′ and 45′ lines below are applied: those four lines give, at
45′, Charles, Clément, Thomas, Pierre, Nicodème, Lucas and Samuel on the pitch with Benjamin, Rémi,
Lucien and Maxime off it. **The 47′ block differs from that by exactly one pair: Maxime is on the pitch
(at `MC`) and Lucas off it, the reverse of the derived state** — so Maxime is back without a line
bringing him on, and Lucas is off without a line taking him off. In the block Thomas has also moved
`MC` → `DC`. See the open questions.

**Block 50′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Rémi |
| `MC` | Maxime |
| `AIL` (right) | Thomas |
| `DC` | Nicodème |
| `DC` | Lucas |
| `GB` | Samuel |

Off the pitch: Lucien, Clément, Pierre, Benjamin.

**UNCERTAIN:** the `AIL` (right) name is written over another name in heavy ink; the final, over-written
word reads « Thomas » and that is what is recorded here. What is underneath cannot be read.

Changes from 47′: **off** Clément, Pierre — **on** Rémi (`AIL` left), Lucas (`DC`); Thomas moves `DC` →
`AIL` (right). No substitution line records them.

**Block 55′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Benjamin |
| `MC` | Pierre |
| `AIL` (right) | Rémi |
| `DC` | Nicodème |
| `DC` | Maxime |
| `GB` | Samuel |

Off the pitch: Thomas, Lucas, Lucien, Clément.
Changes from 50′: **off** Thomas, Lucas — **on** Benjamin (`AIL` left), Pierre (`MC`); Rémi moves `AIL`
(left) → `AIL` (right), Maxime moves `MC` → `DC`. No substitution line records them.

**UNCERTAIN:** a substitution line sits immediately above this block and is struck out completely —
minute, both names and both arrows. Unreadable.

**Block 57′**

| position | player |
| --- | --- |
| `AT` | Benjamin |
| `AIL` (left) | Pierre |
| `MC` | Thomas |
| `AIL` (right) | Rémi |
| `DC` | Nicodème |
| `DC` | Maxime |
| `GB` | Samuel |

Off the pitch: Clément, Charles, Lucien, Lucas.
Changes from 55′: **off** Charles — **on** Thomas (`MC`); Benjamin moves `AIL` (left) → `AT`, Pierre
moves `MC` → `AIL` (left). No substitution line records it.

**Block 59′**

| position | player |
| --- | --- |
| `AT` | Charles |
| `AIL` (left) | Thomas |
| `MC` | Maxime |
| `AIL` (right) | Pierre |
| `DC` | Lucas |
| `DC` | Nicodème |
| `GB` | Samuel |

Off the pitch: Lucien, Clément, Rémi, Benjamin.
Changes from 57′: **off** Benjamin, Rémi — **on** Charles (`AT`), Lucas (`DC`); Thomas moves `MC` →
`AIL` (left), Pierre moves `AIL` (left) → `AIL` (right), Maxime moves `DC` → `MC`. No substitution line
records them. This is the last block on the sheet.

### Substitution lines written on the sheet

| minute | on | off | position taken |
| --- | --- | --- | --- |
| 37′ | Clément | Rémi | **UNCERTAIN:** no position on the line. Rémi was `AIL` (left) at 30′ and Clément is `AIL` (left) in the 47′ block, so `AIL` (left). There is also a short scribble struck out between « 37′ » and the arrow. |
| 39′ | Benjamin | Charles | **UNCERTAIN:** Charles was `AT`; Benjamin presumably takes `AT`. Reversed six minutes later by the 45′ line. |
| 39′ | Thomas | Maxime | **UNCERTAIN:** Maxime was `MC`. But the 47′ block has Maxime at `MC` and Thomas at `DC`, which this line does not explain. |
| 45′ | Charles | Benjamin | **UNCERTAIN:** the reverse of the 39′ line; Charles back at `AT`. |

The two lines at 39′ are written in different columns of the sheet (Benjamin/Charles on the left,
Thomas/Maxime on the right) and the sheet gives no ordering between them.

### Goals for

| minute | scorer | assist |
| --- | --- | --- |
| 32′ | Pierre | none shown |
| 58′ | Pierre | Benjamin — written « Passe Benjamin » on the line below |

**UNCERTAIN:** the second minute reads `58'`; the second digit is ambiguous and could be a `3`
(i.e. `53'`). `58` is the better reading.

Positions at those minutes, derived from the blocks (not written on the sheet): at 32′ the 30′ block
applies, in which Pierre is `AIL` (right). At 58′ the 57′ block applies, in which Pierre is `AIL`
(left) and Benjamin is `AT`.

### Goals against

Written in a box headed « But pris », as bare minutes with no further detail:

| minute | goalkeeper at that minute |
| --- | --- |
| 14′ | Samuel |
| 29′ | Samuel |
| 36′ | Samuel |
| 46′ | Samuel |
| 56′ | Samuel |

The goalkeeper is derivable with certainty for all five: Samuel is `GB` in every block of this sheet.

**UNCERTAIN:** the fourth minute reads `46'` but the leading digit has a stroke through it and could be
a `5`; if it is, the sheet lists `56'` twice. `46'` is the better reading. No scorer, no own-goal flag
and no « who was at fault » is recorded for any of the five — the sheet gives minutes only.

### Sanity check

The sheet lists **2 goals for** (32′, 58′) and **5 goals against** (14′, 29′, 36′, 46′, 56′), which
would make the match **2–5**. **There is no final score written on the sheet to check that against**,
so the check cannot be completed: the goals are self-consistent but unverified. Flagging rather than
reconciling, per the brief.

### Anything else on the sheet

No injuries, no cards, no penalties, no man of the match, no ratings, no supporters list.

The top third of the page is a list of **app feature ideas**, not match data. Transcribed as written,
French verbatim:

> Buteurs / Passeurs / Buteurs par min / Passeurs par min
> But encaissé / But encaissé au goal. / But encaissé toutes les ?? de minutes
> But encaissé toutes les ?? de minutes au goal /.
> Minutes jouées goal / Minutes jouées par le terrain /.
>
> **Compos types** — offensives → la compo la plus prolifique ↳ la meilleure attaque. `+GOAL`
> défensive → la compo qui prend le moins de buts.
>
> **Compo type** → **7 de légende** ↳ Meilleurs à chaque poste.

**UNCERTAIN:** the two-character token written « ?? » above is illegible in both lines; it is the
granularity of a rate (« toutes les X minutes »). It looks like two characters, possibly a number.
Everything else in this quotation is legible.

---

## What is settled, and what is still open

**Settled since the first transcription.**

- **Which match each sheet is**, and with it every match-level fact no sheet carries — date, opponent,
  home/away, competition, the **2×30** format, and the scores of matches 1 and 2. All read from
  production: Galacticos away, Hexagone at home, Bayern away, all three Coupe Automne, all three 2×30.
  See « What these sheets are for » at the top; the squads decide the identification, 11 for 11 and 10
  for 10.
- **Matches 1 and 2 need no goals from the paper.** Production already holds 3–9 and 3–2 with full
  event logs. The earlier worry that they would import as 0–0 does not apply: nothing new is being
  created.
- **Match 1 is fully verified by the owner** (2026-10-12): the three substitution lines at 47′, 48′ and
  56′, their positions, and every block. Blocks for 47′, 48′ and 56′ are derived above and reconcile
  with the 51′ block already on the paper — which also explains that block's overwrites.
- **The purpose**: a record of everyone's position at all times, written back onto the matches that
  already exist.

## Open questions for the owner

**The one that decides the whole shape of the work:**

1. **How should positions reach matches that already have a frozen event log?** `match_events` is
   append-only (invariant 1) and the starting composition cannot be voided (decision 150), so the
   log of matches 1 and 2 cannot simply be rewritten. Three ways, and this is the owner's call:
   - **append** a change at each minute the paper shows one, through the post-match « Ajouter un
     changement » path (decision 169) — which does accept nobody-in-nobody-out, so a pure position
     move is expressible. Honest and additive, but the log then contains the old inherited-slot
     substitutions *and* the corrections;
   - **rebuild** those two matches' logs from the paper — truer, but it means deleting events, which
     the invariant forbids, so it would need its own decision superseding it;
   - **leave matches 1 and 2 alone** and apply the paper only to match 3, accepting that the first two
     keep goalkeeper minutes that are wrong.
2. **Production's goalkeeper minutes for match 1 are wrong** (two keepers recorded, four on the paper).
   Confirm that the paper is right and production is the artefact, before anything is written.

**Match 3, which is the one still live in production:**

3. **Its result.** The sheet lists 2 goals for and 5 against, implying 2–5, and production has the
   match `live` with 9 events and no final whistle. Is 2–5 the final score?
4. **`58'` or `53'`** for Pierre's second goal, and **`46'` or `56'`** for the fourth goal conceded
   (which would put two at 56′).
5. **The assist on the 32′ goal** — one, or genuinely none?
6. **Match 3, 39′ → 47′:** the 39′ line takes Maxime off for Thomas, yet the 47′ block has Maxime at
   `MC`, Thomas at `DC`, and Lucas off with no line taking him off.

**Match 2, not yet verified the way match 1 now is:**

7. **Match 2, 48′ → 54′:** the 48′ line takes Charles off, and the 54′ block has him back at `AT` with
   Clément off instead. Did Charles come back on, or is the line wrong?
8. **Its blocks and lines generally** — match 1 took one message to settle; the same pass over sheet 2
   would settle it.
9. **Match 2's squad of 10**, with no Benjamin, Thomas, Rémi, Benoît or Léo M. Production agrees
   exactly, so this is likely just true — worth one word of confirmation.

**Smaller, and mostly harmless:**

10. **Is a block the pitch as it was, or a plan?** Match 1's answer is « as it was », since the owner
    verified blocks and lines together and they reconcile. Assumed to hold for sheets 2 and 3.
11. **The illegible corrections** that may hide a name: match 2's 0′ block (a struck name under
    Clément, and a struck bench line) and match 3's 50′ `AIL` (right) (« Thomas » over something).
    Match 1's are now explained.
12. **The scribbled-over minutes**: `11'` on sheet 2, `10'` and `47'` on sheet 3. Match 1's `11'` is
    confirmed.
13. **Supporters.** Every named player appears on the pitch in at least one block on all three sheets,
    so as read there are no unused substitutes. Production records Léo C as a supporter for match 1,
    which the sheet does not mention — the sheets list only who was off the pitch, so that is
    consistent, not contradictory.
14. **Ratings, injuries, cards, man of the match**: none on any sheet. Production already carries the
    ratings the owner supplied by hand and one declared injury for match 1.
