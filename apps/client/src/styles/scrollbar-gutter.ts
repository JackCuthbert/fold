// docs/specs/ui.md — one left edge, including controls.
//
// `.mainScroll` (main-screen.module.css) keeps a stable scrollbar gutter so
// the list doesn't jump sideways the moment a list grows past a screenful.
// That gutter permanently narrows the scroller's content box, so its
// centred inner column no longer centres in the same width as the sticky
// header beside it — the header is not a scroll container, and
// `scrollbar-gutter` has no effect on it.
//
// The header mirrors the reserved width with a plain inline-end padding
// instead, which needs the width as a number. It is platform-dependent
// (classic scrollbars take real width; macOS/iOS overlay scrollbars take
// none) and not exposed by CSS, so measure it once here and publish it as
// a custom property for the stylesheet to consume.
export function publishScrollbarGutter(doc: Document = document): number {
  const probe = doc.createElement('div')
  // Force a scrollbar inside an off-screen box: the difference between the
  // border box and the content box is exactly the gutter we must reserve.
  probe.style.cssText =
    'position:absolute;top:-9999px;width:100px;height:100px;overflow-y:scroll;'
  doc.body.appendChild(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()

  doc.documentElement.style.setProperty('--scrollbar-gutter', `${width}px`)
  return width
}
