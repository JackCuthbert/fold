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
// cleanly to the smaller sizes a home screen uses. 192 and 512 are the
// two the web app manifest declares (docs/architecture/pwa.md) — 512 is
// what Android uses for the splash screen, and the small one avoids it
// downscaling a large icon on every launch.
//
// `background` fills the canvas instead of leaving it transparent. The
// rule is **installed icons are opaque, tab favicons are not**: a Home
// Screen or launcher icon is drawn onto the user's wallpaper, so a
// transparent PNG with dark ink disappears on a dark background, while a
// tab favicon wants transparency so it takes the tab strip's own colour
// rather than carrying a paper-coloured card into a dark theme.
// Only `favicon-32.png` is on the transparent side of that line.
// `inset` shrinks the mark within the canvas — the *maskable* icon is
// cropped to whatever shape the platform prefers (a circle on most
// Android launchers), so the glyph has to sit inside the safe zone the
// spec defines as the middle 80%.
const SIZES = [
  { size: 32, name: 'favicon-32.png' },
  // The Home Screen icon needs the background for the same reason the
  // manifest icons do, and it is the one place it was originally missed:
  // iOS does **not** composite an apple-touch-icon onto white. It draws it
  // straight onto the wallpaper, so a transparent PNG with dark ink came
  // out black-on-black on a dark background. It also rounds the corners,
  // hence the same inset as the maskable icon below — artwork that runs to
  // the edge gets clipped by the squircle.
  // *(fixed 2026-08-08: was transparent and full-bleed.)*
  {
    size: 180,
    name: 'apple-touch-icon.png',
    background: '#faf9f6',
    inset: 0.2,
  },
  { size: 192, name: 'icon-192.png', background: '#faf9f6' },
  { size: 512, name: 'icon-512.png', background: '#faf9f6' },
  {
    size: 512,
    name: 'icon-512-maskable.png',
    background: '#faf9f6',
    inset: 0.2,
  },
]

const browser = await chromium.launch()
try {
  for (const { size, name, background, inset = 0 } of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    const glyph = Math.round(size * (1 - inset))
    await page.setContent(
      `<style>html,body{margin:0;padding:0;` +
        `background:${background ?? 'transparent'}}` +
        // Centred rather than filling the canvas, so an inset icon keeps
        // its mark in the middle instead of pinned to a corner.
        `body{display:flex;align-items:center;justify-content:center;` +
        `width:${size}px;height:${size}px}` +
        `svg{display:block;width:${glyph}px;height:${glyph}px}</style>` +
        flattened,
    )
    // Tab favicons stay transparent, so the mark sits on whatever the
    // browser paints behind it rather than carrying a white card into a
    // dark tab strip. Installed icons take the background above instead —
    // see the note on SIZES.
    const buffer = await page.screenshot({
      omitBackground: background === undefined,
    })
    // A blank render is the failure this script has already produced once
    // (see `flattened`), and it is silent — the file is written, just
    // empty.
    //
    // Checked by sampling the *pixels*, not the file size. A byte floor
    // worked while every icon was transparent (an empty one was 117 bytes,
    // a drawn one comfortably over 400), but an opaque icon carries its
    // background: a completely blank 180px canvas is 488 bytes and sailed
    // past a 400-byte threshold. Counting ink is the thing actually being
    // asserted, and it does not need retuning per size or background.
    // *(changed 2026-08-08, when the installed icons became opaque.)*
    const inkRatio = await page.evaluate(
      async (dataUrl) => {
        const img = new Image()
        img.src = dataUrl
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return 0
        ctx.drawImage(img, 0, 0)
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
        let ink = 0
        for (let i = 0; i < data.length; i += 4) {
          // The mark is near-black (#1a1816) on paper or on nothing; anything
          // dark *and* opaque is the glyph.
          if (data[i + 3] > 128 && data[i] < 128) ink += 1
        }
        return ink / (canvas.width * canvas.height)
      },
      `data:image/png;base64,${buffer.toString('base64')}`,
    )

    // The mark covers roughly 10-20% of its canvas at every size measured.
    // 2% is far below that and far above zero, so it catches a blank render
    // without tracking the artwork's exact weight.
    if (inkRatio < 0.02) {
      throw new Error(
        `${name} rendered with ${(inkRatio * 100).toFixed(2)}% ink, which ` +
          'means the mark did not draw. Check that favicon.svg still has a ' +
          '`<g fill="none"` for the stroke colour to attach to.',
      )
    }
    writeFileSync(join(publicDir, name), buffer)
    console.log(
      `${name}  ${size}x${size}  ${buffer.length} bytes  ` +
        `${(inkRatio * 100).toFixed(1)}% ink`,
    )
    await page.close()
  }
} finally {
  await browser.close()
}
