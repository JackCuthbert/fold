import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode, RefObject } from 'react'
import { LuX } from 'react-icons/lu'
import { cx } from './styles/cx'
import styles from './modal-header.module.css'

/**
 * A modal's header: its title, and a ✕ to close it.
 *
 * docs/specs/ui.md — overlays: modals close on Escape, on a click outside,
 * and from a ✕ at the trailing edge of the header, which is where people
 * reach first.
 *
 * One component rather than five copies. Every dialog in the app rendered
 * its own `Dialog.Title` with a local `.title` rule, and those rules were
 * near-identical — which is exactly how they drifted apart before (the
 * padding and divider fixes of 2026-08-01 had to be applied five times).
 * The divider, the padding and the ✕ now live in one module, so a modal
 * that wants a header cannot accidentally style one differently.
 *
 * The confirm dialog deliberately does **not** use this — see confirm.tsx.
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
}) {
  return (
    <div className={styles['header']}>
      <Dialog.Title
        {...(props.titleRef ? { ref: props.titleRef, tabIndex: -1 } : {})}
        className={cx(
          styles['title'],
          props.size === 'large' && styles['titleLarge'],
        )}
      >
        {props.children}
      </Dialog.Title>
      {/* Base UI's own close semantics rather than a hand-rolled onClick,
          so every modal dismisses through the same path Escape and an
          outside click already use (docs/specs/ui.md — component library:
          prefer the primitive over hand-rolling). */}
      <Dialog.Close className={styles['close']} aria-label="Close">
        {/* The glyph carries no text, so the button is named by its
            aria-label and the icon is hidden from assistive tech. */}
        <LuX aria-hidden="true" size={14} />
      </Dialog.Close>
    </div>
  )
}
