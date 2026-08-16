/**
 * Convert a downloaded variable TTF to woff2 for `apps/client/public/fonts/`.
 *
 *   bun run fonts:convert <in.ttf> <out.woff2>
 *
 * The fonts are committed rather than fetched at build time — the app is
 * offline-capable and must not depend on a font CDN
 * (docs/specs/themes.md). This script is how they got there, kept so the
 * provenance is reproducible: run it again when a face is added or a
 * newer upstream release is picked up.
 *
 * Sources are the upstream Google Fonts repository, all OFL:
 *   https://github.com/google/fonts
 *
 * **Not subsetted.** Lora is 83kB upright and 89kB italic, Cabin 67kB/70kB,
 * which is acceptable; a face heavier than that should be subsetted to
 * Latin first. Doing so needs fonttools, which is a Python dependency this
 * repo deliberately does not take (CLAUDE.md — never install anything
 * system-wide), so it would have to run in Docker.
 */
import { compress } from 'wawoff2'
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: bun run fonts:convert <in.ttf> <out.woff2>')
  process.exit(1)
}

const ttf = readFileSync(input)
const woff2 = await compress(ttf)
writeFileSync(output, woff2)
console.log(
  `${input} → ${output}  ` +
    `${(ttf.length / 1024).toFixed(0)}kB → ${(woff2.length / 1024).toFixed(0)}kB`,
)
