import styles from './fold-artwork.module.css'

/**
 * The login page's artwork half — docs/specs/authentication.md (login), and
 * the split-pane layout in docs/specs/ui.md.
 *
 * **A field, not a picture.** Three planes of the same paper meeting along
 * two soft diagonal folds: the tone changes gradually across each plane and
 * a hairline marks where the sheet turns. Nothing is depicted, which is the
 * point — this is the screen you pass through on the way to your todos, and
 * an image with a subject invites the eye to work out what it is.
 *
 * It replaced a drawing of a stack of paper. That was a literal reading of
 * the app's name and read as exactly that: some pages. The brief was
 * *calm*, and calm is better served by a surface than by an object on one.
 * *(changed 2026-08-10.)*
 *
 * **Nothing here is a colour.** Every stop is a `color-mix()` of `--paper`,
 * `--accent` and `--ink`, so the whole field re-derives from whichever
 * palette and mode is active (styles/palettes.css) — including Paper, the
 * default, which has the least accent to work with. That is also why this
 * is CSS rather than an SVG or a raster: a committed image would keep one
 * fixed set of colours while the page around it changed.
 *
 * `aria-hidden`: it is decoration. Everything the page says, it says in
 * text beside this (docs/specs/ui.md — accessibility).
 */
export function FoldArtwork() {
  return (
    <div className={styles['field']} aria-hidden="true">
      {/* The two folds. Separate elements rather than more gradient stops
          because a hairline is a different kind of mark from a change of
          tone: the wash says the plane is turning, the line says exactly
          where. Tilted, so the planes read as a sheet held at an angle
          rather than as horizontal bands — which is what made an earlier,
          level version look like a chart. */}
      <span className={styles['fold']} />
      <span className={styles['foldLower']} />
    </div>
  )
}
