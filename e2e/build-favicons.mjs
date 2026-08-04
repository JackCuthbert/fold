/**
 * Render the favicon PNGs from `public/favicon.svg`, and check that the
 * SVG is valid XML.
 *
 *   bun run favicons        (from the repo root)
 *
 * `favicon.svg` is the source of truth — the same origami glyph the nav
 * header renders (docs/specs/ui.md). The PNGs exist only as fallbacks for
 * browsers without SVG-favicon support, so they must never be edited by
 * hand: change the SVG, run this, commit all three.
 *
 * It lives in `e2e/` and writes into `apps/client/public/` — an odd shape
 * for a client asset, but this workspace already owns Playwright and its
 * chromium for the test suite. The alternative was making the browser a
 * dependency of the client to render two PNGs, which is a lot of weight
 * for a build step that runs when the logo changes (CLAUDE.md: no new
 * tooling on the machine).
 *
 * *(added 2026-08-04.)*
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/client/public',
)
const source = join(publicDir, 'favicon.svg')
const svg = readFileSync(source, 'utf8')

/**
 * A `--` inside an XML comment terminates it, and a strict parser rejects
 * the entire document over it. Firefox does exactly that and shows no
 * icon; Chrome recovers silently, so this shipped once looking fine and
 * was only caught in another browser.
 *
 * Checked here rather than left to a linter because the comments in that
 * file talk about CSS custom properties, which are spelled with two
 * leading hyphens — the mistake is easy to make and invisible until the
 * icon disappears in one browser.
 */
function assertWellFormed(markup) {
  for (const comment of markup.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (comment[1].includes('--')) {
      throw new Error(
        'favicon.svg: a comment contains "--", which ends an XML comment ' +
          'early and makes the file invalid. Firefox will refuse to ' +
          'render it. Rewrite the comment without a double hyphen.',
      )
    }
  }
}

assertWellFormed(svg)

/**
 * The PNGs are a fallback, so they cannot be theme-aware — one fixed
 * colour has to serve both. Dropping the `<style>` block removes the
 * light/dark rules *and* the only `stroke` declaration, so the ink goes
 * back on the group explicitly; without it every path renders unstroked
 * and the PNG comes out blank.
 */
const flattened = svg
  .replace(/<style>[\s\S]*?<\/style>/, '')
  .replace('<g fill="none"', '<g fill="none" stroke="#1a1816"')

// 32 for the browser tab; 180 is what iOS asks for, and downsamples
// cleanly to the smaller sizes a home screen uses.
const SIZES = [
  { size: 32, name: 'favicon-32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
]

const browser = await chromium.launch()
try {
  for (const { size, name } of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}` +
        `svg{display:block;width:${size}px;height:${size}px}</style>` +
        flattened,
    )
    // Transparent, so the mark sits on whatever the browser paints behind
    // it rather than carrying a white card into a dark tab strip.
    const buffer = await page.screenshot({ omitBackground: true })
    // A blank render is the failure this script has already produced once
    // (see `flattened`), and it is silent — the file is written, just
    // empty. A stroked 32px mark is comfortably over 400 bytes; an empty
    // one was 117.
    if (buffer.length < 400) {
      throw new Error(
        `${name} rendered at ${buffer.length} bytes, which means the mark ` +
          'did not draw. Check that favicon.svg still has a `<g fill="none"` ' +
          'for the stroke colour to attach to.',
      )
    }
    writeFileSync(join(publicDir, name), buffer)
    console.log(`${name}  ${size}x${size}  ${buffer.length} bytes`)
    await page.close()
  }
} finally {
  await browser.close()
}
