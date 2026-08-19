import type { QuickAddToken } from './quick-add'

// docs/specs/quick-add.md — what a contenteditable costs.
//
// The caret in a contenteditable is a DOM position: a node plus an offset
// into it. Everything else in quick add addresses text by a plain offset
// into the string — `replaceToken` returns one, the parser's tokens are
// `slice`-compatible ranges — so these two functions are the whole
// translation layer between the two worlds, and nothing above them has to
// know a Range exists.
//
// The `<input>` this replaced had `setSelectionRange` for the same job.

/**
 * Where the caret is, as an offset into the element's plain text.
 *
 * `null` when the selection is somewhere else on the page, which is the
 * ordinary case while a pill menu is open.
 *
 * Measured by asking a Range how much text precedes the caret rather than
 * by walking and summing node lengths ourselves: a Range counts exactly
 * what `innerText` would return over the same span, so the two agree even
 * when the marks split the text into many nodes.
 */
export function caretOffset(el: HTMLElement): number | null {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (!el.contains(range.endContainer)) return null

  const toCaret = range.cloneRange()
  toCaret.selectNodeContents(el)
  toCaret.setEnd(range.endContainer, range.endOffset)
  return toCaret.toString().length
}

/**
 * Put the caret at a plain-text offset, counting through the text nodes.
 *
 * `>=` rather than `>` when finding the node: an offset landing exactly on
 * a node's end belongs to that node, at its final position. Preferring the
 * *next* node would put the caret on the far side of a mark's boundary,
 * so typing after a token would land inside it.
 *
 * An offset past the end clamps to the last text node rather than throwing
 * — the text can only have shrunk under a caret we are restoring, and the
 * end of the line is the sane place to be.
 */
export function placeCaret(el: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let seen = 0
  let last: Node | null = null

  // `SHOW_TEXT` guarantees every node here is a Text, but the DOM types
  // say `Node` — narrowed by checking rather than asserted, so this stays
  // honest if the filter ever changes.
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (seen + length >= offset) {
      select(node, offset - seen)
      return
    }
    seen += length
    last = node
  }

  // Nothing long enough: an empty field has no text node at all, so put
  // the caret in the element itself rather than giving up.
  if (last) select(last, last.textContent?.length ?? 0)
  else select(el, 0)
}

function select(node: Node, offset: number): void {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Must the marks be redrawn?
 *
 * **This is what keeps undo native.** Writing `innerHTML` empties the
 * browser's undo stack — measured 2026-08-19, and the reason `⌘Z` does
 * nothing at all in a naive highlighting editor. Answering `false` here
 * leaves the DOM untouched, so the browser's own editing, and its undo
 * history along with it, is never disturbed.
 *
 * **Compares the marked *words*, not their offsets.** Offsets were the
 * first implementation and were wrong in use: typing anywhere before a
 * token shifts every later token's `start` and `end`, so a keystroke in
 * the middle of the summary counted as a change and forced a redraw. That
 * made the redraw the common case rather than the rare one and cost an
 * undo entry per keystroke — the exact failure this predicate exists to
 * prevent. The marks are drawn around text, and text that has only slid
 * along the line is still in the right DOM node.
 * *(fixed 2026-08-19, found in the browser.)*
 */
export function tokensChanged(
  before: readonly QuickAddToken[],
  after: readonly QuickAddToken[],
  beforeText: string,
  afterText: string,
): boolean {
  if (before.length !== after.length) return true
  return before.some((token, index) => {
    const other = after[index]
    return (
      !other ||
      token.kind !== other.kind ||
      beforeText.slice(token.start, token.end) !==
        afterText.slice(other.start, other.end)
    )
  })
}

/**
 * Where the caret is on screen, in viewport coordinates.
 *
 * `null` when the selection is outside `el`, or when the browser reports
 * no rect at all — a collapsed range at the very start of an empty element
 * gives an empty list rather than a zero-width rect.
 *
 * A collapsed range has no dimensions in some engines, so this expands it
 * by one character where it can and measures that instead. The
 * `getClientRects()[0]` path covers the ordinary case, and is preferred
 * because it is the caret's own line rather than a character beside it —
 * which matters on a wrapped field, where the two can be different lines.
 */
export function caretRect(
  el: HTMLElement,
): { bottom: number; left: number } | null {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (!el.contains(range.endContainer)) return null

  const direct = range.getClientRects()[0]
  if (direct) return { bottom: direct.bottom, left: direct.left }

  // Collapsed with no rect of its own: measure the character before the
  // caret, which sits on the same line, and take its trailing edge.
  const probe = range.cloneRange()
  const offset = range.endOffset
  if (offset > 0) {
    probe.setStart(range.endContainer, offset - 1)
    const before = probe.getClientRects()[0]
    if (before) return { bottom: before.bottom, left: before.right }
  }

  // Nothing measurable — an empty field. Its own box is the best answer.
  const box = el.getBoundingClientRect()
  return { bottom: box.top + el.clientHeight, left: box.left }
}
