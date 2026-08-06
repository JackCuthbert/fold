import { Dialog } from '@base-ui/react/dialog'
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { LuX } from 'react-icons/lu'
import { cx } from '../styles/cx'
import styles from './modal-header.module.css'

/**
 * A surface's header: its title, and a ✕ to close it.
 *
 * docs/specs/ui.md — overlays: modals close on Escape, on a click outside,
 * and from a ✕ at the trailing edge of the header, which is where people
 * reach first.
 *
 * One component rather than five copies. Every dialog in the app rendered
 * its own `Dialog.Title` with a local `.title` rule, and those rules were
 * near-identical — which is exactly how they drifted apart before (the
 * padding and divider fixes of 2026-08-01 had to be applied five times).
 * The divider, the padding and the ✕ now live in one module, so a surface
 * that wants a header cannot accidentally style one differently.
 *
 * The confirm dialog deliberately does **not** use this — see confirm.tsx.
 *
 * *(changed 2026-08-03, issue #4: the todo detail panel is a layout column
 * on desktop rather than a dialog, so it has no Dialog context for
 * `Dialog.Title`/`Dialog.Close` to consume — they throw outside one. What
 * varies between a dialog and a plain column is only those two *elements*;
 * the padding, the divider and the ✕'s styling — the reason this component
 * exists — do not. So callers may substitute the elements via `render`,
 * and this module keeps owning the shape. A boolean `isDialog` would only
 * have invited a second boolean the next time something differed.)*
 */
export function ModalHeader(props: {
  children: ReactNode
  /**
   * The larger heading used by the todo detail panel, the app's biggest
   * surface title. Everything else shares the modal title size.
   */
  size?: 'large'
  /**
   * Lets a caller hold initial focus on the title. Only the help modal
   * needs it, and only because its body genuinely scrolls — see
   * help-modal.tsx.
   */
  titleRef?: RefObject<HTMLHeadingElement | null>
  /**
   * The elements to render the title and ✕ as. Both default to Base UI's
   * `Dialog.Title`/`Dialog.Close`, so every modal caller passes nothing
   * and dismisses through the same path Escape and an outside click use
   * (docs/specs/ui.md — component library: prefer the primitive over
   * hand-rolling). The detail column supplies a plain `<h2>` and a
   * `<button onClick>` instead, having no Dialog to close.
   */
  render?: {
    title: ReactElement
    close: ReactElement
  }
  /**
   * A short status about the surface, shown after the title and before the
   * ✕ — the todo panel's "Unsaved changes".
   *
   * Here rather than beside the surface's buttons because the header is a
   * fixed row at a fixed place: the actions row is the panel's widest,
   * most variable strip, where a right-aligned note drifted far from
   * anything it referred to on a wide panel, and wrapped on a narrow one.
   * *(added 2026-08-04.)*
   */
  status?: ReactNode
}) {
  const title = props.render?.title ?? <Dialog.Title />
  const close = props.render?.close ?? <Dialog.Close />

  return (
    <div className={styles['header']}>
      {cloneElement(title, {
        ...(props.titleRef ? { ref: props.titleRef, tabIndex: -1 } : {}),
        className: cx(
          styles['title'],
          props.size === 'large' && styles['titleLarge'],
        ),
        children: props.children,
      })}
      {props.status !== undefined && props.status !== false && (
        <span className={styles['status']}>{props.status}</span>
      )}
      {cloneElement(close, {
        className: styles['close'],
        'aria-label': 'Close',
        // The glyph carries no text, so the button is named by its
        // aria-label and the icon is hidden from assistive tech.
        children: <LuX aria-hidden="true" size={14} />,
      })}
    </div>
  )
}
