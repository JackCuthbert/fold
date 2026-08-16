import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ModalHeader } from '../../ui'
import { cx } from '../../styles/cx'
import { RETENTION_DAYS, type ClearableCounts } from '../lib/retention'
import styles from './clear-completed-dialog.module.css'

export interface ClearCompletedDialogProps {
  open: boolean
  counts: ClearableCounts
  /**
   * How wide the clear reaches. `'list'` is the completed section of the
   * list you are looking at; `'all'` is every list, from Summary — which
   * gathers finished work from all of them, so a clear started there
   * cannot honestly be scoped to one. The dialog says which, because the
   * blast radius is the thing the user is consenting to.
   */
  scope?: 'list' | 'all'
  onOpenChange: (open: boolean) => void
  onClear: (scope: 'old' | 'all') => void
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

/**
 * Clearing a list's completed todos (docs/specs/todos.md — clearing
 * completed todos).
 *
 * **The dialog is the chooser, not just a confirm.** Bulk clearing was
 * removed the day `COMPLETED` capture landed, because a completed todo
 * carries the only record that the work was done and the Summary view is
 * built entirely from those records (issue #1). What makes it safe to
 * bring back is that the two paths are not equally destructive, and the
 * user picks between them here rather than getting one button whose
 * consequences depend on data they cannot see:
 *
 * - **Clear old completed** deletes only what Summary has already stopped
 *   showing — the same 30-day cutoff bounds both, so this can never
 *   destroy visible history. It is the primary action.
 * - **Clear everything** takes recent work too, and says how much history
 *   that costs. Secondary, and styled as the destructive one it is.
 *
 * An `AlertDialog` rather than a `Dialog`: this interrupts to ask about
 * something irreversible, so it should not be dismissible by clicking the
 * scrim (docs/specs/ui.md — destructive actions).
 *
 * Undated todos are never deleted by either action and are called out
 * here, so a "clear everything" that visibly leaves rows behind is
 * explained rather than looking broken (issue #39).
 *
 * *(added 2026-08-09, issue #1.)*
 */
export function ClearCompletedDialog(props: ClearCompletedDialogProps) {
  const { old, recent, undated } = props.counts
  const everywhere = props.scope === 'all'
  const where = everywhere ? ' across every list' : ''

  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={cx(styles['backdrop'])} />
        <AlertDialog.Popup className={cx(styles['popup'])}>
          <ModalHeader>Clear completed</ModalHeader>
          <div className={styles['body']}>
            <p className={styles['lead']}>
              Deleting a completed todo removes the only record that the work
              was ever done. It disappears from Summary permanently, and there
              is no undo.
            </p>

            {old > 0 && (
              <button
                type="button"
                className={styles['primary']}
                onClick={() => {
                  props.onClear('old')
                  props.onOpenChange(false)
                }}
              >
                <span className={styles['actionLabel']}>
                  Clear old completed
                </span>
                <span className={styles['actionNote']}>
                  {plural(old, 'todo')} finished more than {RETENTION_DAYS} days
                  ago{where}. Summary no longer shows these, so nothing you can
                  see is lost.
                </span>
              </button>
            )}

            {recent > 0 && (
              <button
                type="button"
                className={styles['destructive']}
                onClick={() => {
                  props.onClear('all')
                  props.onOpenChange(false)
                }}
              >
                <span className={styles['actionLabel']}>
                  Clear everything completed
                </span>
                <span className={styles['actionNote']}>
                  All {plural(old + recent, 'todo')}
                  {where}, including {plural(recent, 'todo')} from the last{' '}
                  {RETENTION_DAYS} days that Summary is still showing.
                </span>
              </button>
            )}

            {old === 0 && recent === 0 && (
              <p className={styles['note']}>
                There is nothing here that can be cleared.
              </p>
            )}

            {undated > 0 && (
              <p className={styles['note']}>
                {plural(undated, 'completed todo')} carr
                {undated === 1 ? 'ies' : 'y'} no completion date, so
                {undated === 1 ? ' it is' : ' they are'} left alone — there is
                no way to tell how old {undated === 1 ? 'it is' : 'they are'}.
              </p>
            )}
          </div>

          <div className={styles['footer']}>
            <AlertDialog.Close className={styles['cancel']}>
              Cancel
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
