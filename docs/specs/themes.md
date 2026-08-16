# Themes

*(added 2026-08-10.)*

The app's colours and body typeface are themeable. Both are chosen in
Settings, and both are facts about **this browser** rather than about the
account.

## Browser-local, never synced

**There is no CalDAV property for a theme, and Fold does not invent one.**
The whole app is built on the rule that another client pointed at the same
server sees ordinary lists and todos ([list-kinds](./list-kinds.md) —
entirely app-level); writing an `X-FOLD-PALETTE` to the server to carry a
colour preference would break that for no interoperability gain.

So the theme lives in `localStorage` under `fold-theme`, beside the mute
flag and the list filter. A second device is free to disagree, and that is
the intended behaviour rather than a limitation — a phone at night and a
desktop in daylight want different answers.

The stored value is **validated on read**, not cast: `localStorage` is a
trust boundary like any other (CLAUDE.md). A hand-edited or stale value
naming a palette that no longer exists falls back to the default, because
the alternative is an app rendered with no palette at all.

## What is themeable

**Only the neutral ramp and the accent.** A palette redefines `--paper`,
`--surface`, `--ink`, `--muted`, `--faint`, `--line`, `--accent` and
`--scrim`. It does **not** touch:

- spacing, the type scale, radii or hit areas
- the eight list swatches (`--list-*`), which are user data
- the semantic status colours (synced / syncing / offline) and `--danger`,
  except where a ground needs a different mix to stay legible

Those are the app's identity rather than its finish. A theme that moved
them would be a different app, not a different mood.

## Palettes

| Palette | Character |
|---|---|
| **Paper** | Lighter and cooler, almost white. **The default.** |
| Parchment | Warm off-white, brown accent. The app's original look. |
| Stone | Greyscale with a blue-green cast. |
| Ayu | Very plain, with a burnt orange accent. |
| Catppuccin | Soothing pastel — Latte and Mocha. |
| Dracula | The dark one, in purple and pink. |
| OLED | Always true black, light or dark. |

They are grouped in the picker: **Original** for the app's own three, which
are variations on one paper metaphor differing only in temperature, and
**Extras** for the two chosen for a specific reason rather than a mood — a
screen technology, a palette you already use elsewhere. Listing five as a
flat set would imply they are five shades of the same idea.

"Borrowed" was tried and rejected: OLED is not borrowed from anywhere, and
the name left nowhere for user-defined themes to go. *(added 2026-08-10.)*

*(Paper became the default on 2026-08-10; Parchment was the original. OLED
and Catppuccin added the same day.)*

**OLED** is `#000000` in **both modes**. On an OLED panel a black pixel is
an *off* pixel and that is the whole saving — `#131416` would still be lit —
so a light variant would be the opposite of what someone choosing it asked
for. Selecting the palette is the decision; the mode control simply has
nothing left to do. *(changed 2026-08-10: light borrowed Stone's ramp,
which meant the OS flipping to light silently undid the choice.)*

Surfaces lift by the smallest step that still reads as a raised plane,
hairlines are stronger than elsewhere (against true black the usual
`--line` disappears), and the scrim is nearly opaque, since a translucent
veil over pure black leaves the content behind it legible and the modal
stops reading as modal.

Its swatch shows the dark ramp, where every other palette's shows light —
there is no other ramp to show.

**Catppuccin** takes its values verbatim from the upstream `palette.json`
rather than by eye — the point of a named community theme is that it matches
everywhere it is used. Only the mapping onto Fold's roles is a decision:
`base` is the page and `mantle` the raised surface, which is inverted from
how Catppuccin's own docs describe them for editors, because an editor's
surfaces sit above its base and so does a modal here. `mauve` is the accent,
being the flavour's signature.

**Dracula** takes its values from the theme's own spec repository. It
publishes *no light variant* — it is a dark theme with one background — so
rather than invent one (which would be a Dracula its users would not
recognise) the light mode is a near-white ground carrying the theme's own
purple and comment blue, and anyone who wants the real thing pins the mode
to dark.

**Ayu** comes from `ayu-vim`'s palette, the source its ports read, and is
the one borrowed theme whose light variant is as considered as its dark —
so both are its own rather than derived. Its `mirage` third variant is left
out: three grounds under one name would need a picker of its own. One value
is *not* upstream's: `--muted` measured 3.27:1 against Ayu's own paper,
below AA, and `--muted` carries real text — list names, due dates, the meta
pills. It sits between upstream's `fg` and `comment` at 4.55:1.
*(measured 2026-08-10.)*

The three named palettes each carry a **glyph** — a cat, a ghost, a sunrise
— being how each is recognised elsewhere. The app's own three carry none: a
full set would be decoration, and "Paper" needs no picture.

Extras are listed **alphabetically**. Original's order is a progression from
warm to cool; the Extras have no relationship to each other, so the only
honest order is the one a reader can predict.

**You cannot create your own.** Each palette is a hand-tuned pair of light
and dark ramps whose contrast has been checked; a colour picker would
produce combinations that fail legibility, and the app would then need a
render-time contrast guard — the same problem list colours have, and the
reason those are confined to an 8px dot ([lists](./lists.md) — colours).

## Light and dark

Palette and mode are **separate choices**. Mode is `system`, `light` or
`dark`, and `system` is the default — an app that ignores the platform's
own dark-mode switch is the first thing people notice.

The stored preference and the applied mode are deliberately distinct: the
preference can be `system` indefinitely, while what the page renders is only
ever light or dark. `resolveMode` is the one place that collapses the two.

## Native chrome

*(added 2026-08-10.)*

Each mode declares `color-scheme`, which is what tells the browser how to
paint the parts CSS cannot reach: scrollbars, form-control internals, the
spellcheck underline. Without it the browser follows the **OS** preference
and ignores the palette — a Mac forced into dark mode drew a white
scrollbar down the side of a dark app, and a light palette on a dark OS got
a black one. `data-theme` is the only thing that knows which the app is
actually in, so it has to say.

`scrollbar-color` then puts the thumb in the palette rather than leaving it
the browser's grey, mixed from `--ink` against `--paper` so it follows every
palette without being restated.

## The mechanism

Two attributes on `<html>` — `data-palette` and `data-theme` — and the
palettes are plain CSS selected by those attributes
(`apps/client/src/styles/palettes.css`). Switching costs one attribute write
and no React re-render of the tree.

They are applied **before the tree mounts** (`startTheme()` in `main.tsx`),
so the first paint is already in the right palette. Applying from an effect
would show a frame of the default first, which is the flash a theme feature
exists to avoid.

## Typography

**The body face is distributed, not assumed.** It was previously a stack
led by Charter, which is present on macOS and absent on most Linux systems —
so the app silently rendered in Georgia or a default serif for a whole
platform, and nobody could see it happening.

- **Body: Lora**, self-hosted, with a true italic (the app italicises in
  four places, and a synthesised slant is visibly not the same thing).
- **Sans: Cabin**, self-hosted, used for the meta pills and the keyboard
  keycaps via `--meta`.

**Variable fonts only** — one file per family per italic state covering the
whole 400–600 range the app uses, rather than three static weights each.

The sans has to be a shipped font rather than the platform's for a reason
beyond consistency: the meta pills' geometry was measured against one set of
metrics, so leaving the face to the OS would make the row correct on one
platform and subtly wrong on another.

Chosen over the alternatives after measuring how wide each sets a real row
summary at 15px: Source Serif 4 was the widest tested (339px against
Charter's 317px) and cost 418kB; Crimson Pro set too small vertically;
Faustina's baseline threw off the row's centred alignments. Lora is 335px
and 83kB. *(measured 2026-08-10.)*

**Not yet subsetted.** Lora is 83kB upright and 89kB italic, Cabin 67kB and
70kB — acceptable, but a heavier face should be subset to Latin first.
Doing that needs `fonttools`, a Python dependency this repo deliberately
does not take, so it would have to run in Docker. See
`scripts/convert-fonts.mjs`.

## Settings

Appearance is the first section of the Settings modal, laid out as titled
sections matching the help modal ([ui](./ui.md) — overlays).

A palette is shown as a **swatch, not a name**: three bands on the
palette's own paper, proportioned like the app — mostly ground, a line of
ink, a touch of accent. A radio list of the words would make the user apply
each one to find out what it is. The swatches stay in **light mode even in
dark**, because the swatch answers "what is this palette" and the mode
control beside it answers "light or dark"; a swatch that flipped would
conflate the two decisions.

Mode is a segmented row of three rather than a switch, because `System` is
one of the states and a two-position toggle cannot express it.

A typeface is shown as its **name set in that face**, the font-manager
convention, with one line beneath saying what it is like to live with —
*also* set in that face, so the sentence is the specimen as well as the
explanation. A pangram sat between them briefly and was cut: once the
character line existed the row carried two samples of the same font, and
the pangram was the one that said nothing. The line is kept to consequences
("takes more room") rather than adjectives, since calling a face "elegant"
would be selling rather than informing. It ellipsises rather than wrapping,
so both rows stay the same height.

## On the login screen

*(added 2026-08-10.)*

A small dropdown sits beside the sign-in footnote, naming each palette and
carrying its swatch, grouped the same way Settings is. The theme is
browser-local, so it can be set before there is an account — someone who
wants true black at night should not have to sign in first to get it.

**Named rather than swatched**, unlike Settings. A row of unlabelled dots
was tried first: it could show the colours but never say "OLED" or
"Catppuccin", which are chosen by name rather than by appearance.
*(changed 2026-08-10.)*

Mode is left out entirely, since `system` already follows the OS, which
covers the case the control exists for.
