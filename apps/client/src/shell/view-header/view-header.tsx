import type { Todo, TodoList } from '@fold/schemas'
import type { ReactNode } from 'react'
import { LuMenu, LuSparkles } from 'react-icons/lu'
import { BulkActions } from '../../lists/bulk-actions/bulk-actions'
import type { kindExplanation } from '../../lists/lib/list-kind'
import { cx } from '../../styles/cx'
import { InfoBadge } from '../../ui/info-badge/info-badge'
import styles from '../main-screen/main-screen.module.css'

/**
 * The sticky header above whatever pane is showing: the nav toggle, the
 * title, the count line and the whole-list actions.
 *
 * Extracted from MainScreen (issue #28) because it is the part of that
 * component that *grows*: it has gained a colour dot, an info badge, a
 * kind sparkle, a count line and a bulk-action row over five separate
 * changes, each adding to the same 90-line block of inline JSX.
 *
 * docs/specs/ui.md — mobile: the nav trigger sits beside the list title,
 * forming the top row of the content column, rather than a floating button
 * in a corner. The title stays centred above the list on every viewport;
 * on desktop a matching toggle collapses and expands the pinned sidebar.
 *
 * docs/specs/ui.md — scrolling: this header is sticky, so the title, the
 * nav toggle and "Add a todo" stay in view; only `.mainScroll` beneath it
 * scrolls.
 */
interface ViewHeaderProps {
  /** Title and explanation when a derived view is showing; null in a list. */
  derivedInfo: { title: string; about: string } | null
  activeList: TodoList | undefined
  /** What Fold makes of the list's name — docs/specs/list-kinds.md. */
  kindInfo: ReturnType<typeof kindExplanation>
  /** The count line, or null while it is still unknown. */
  viewCount: string | null
  /** The list's own active todos, for the bulk actions. */
  listActiveTodos: Todo[]
  /**
   * The drawer's `Dialog.Trigger`, passed in rather than rendered here.
   *
   * Base UI needs the trigger inside its own `Dialog.Root` to wire focus
   * restoration, so the ☰ that opens the drawer cannot be a separate
   * button — it is the same element, handed down.
   */
  drawer: ReactNode
  drawerAvailable: boolean
  desktopNavOpen: boolean
  onToggleDesktopNav: () => void
}

export function ViewHeader(props: ViewHeaderProps) {
  return (
    <div className={styles['header']}>
      <div className={styles['headerRow']}>
        {/* The drawer's own trigger whenever the drawer is the
                  surface the ☰ opens — on mobile, and on desktop while
                  auto-collapsed. Base UI needs the trigger inside its
                  `Dialog.Root` to wire focus restoration, so this is the
                  same element either way, not a second button. */}
        {props.drawerAvailable && props.drawer}
        {!props.drawerAvailable && (
          <button
            type="button"
            className={cx(styles['menuTrigger'])}
            aria-label="Lists"
            aria-pressed={props.desktopNavOpen}
            onClick={props.onToggleDesktopNav}
          >
            <LuMenu aria-hidden="true" size={20} />
          </button>
        )}
        <h1 className={styles['title']}>
          {/* The dot and the name are wrapped together, and it is
                    this shrink-to-fit box — not the full-width `.title` —
                    that the info badge hangs off. Anchoring to `.title`
                    would put the badge at the far edge of the header row,
                    since `.title` is `flex: 1` and fills the space between
                    the ☰ and `.headerSpacer`. See `.titleText`.
                    *(added 2026-08-04.)* */}
          <span className={styles['titleText']}>
            {/* docs/specs/lists.md — colours: the list's dot travels
                      with its title, so the colour is still there while you
                      are looking at the list (issue #12). Only for a real
                      list, and only when it has a colour — a derived view is
                      not a collection and has none, and an uncoloured list
                      gets nothing rather than the nav's empty ring (see
                      `.titleDot`). */}
            {props.activeList?.color !== undefined && (
              <span
                className={styles['titleDot']}
                style={{ background: props.activeList.color }}
                aria-hidden="true"
              />
            )}
            {props.derivedInfo?.title ??
              props.activeList?.displayName ??
              'Todos'}
            {/* docs/specs/today-view.md, docs/specs/summary-view.md —
                      the explanation of what a derived view *is* belongs
                      beside that view's own title, where someone wondering
                      what they are looking at is already looking. It used to
                      hang off the nav row (list-nav.tsx), which made two of
                      the nav's rows a different shape from all the others.

                      Only the derived views get one: a list is a collection
                      on the server with a name its owner chose, and nothing
                      about it needs explaining.

                      The wording is the nav's, verbatim — shorter than the
                      help modal's on purpose, and saying the same thing
                      (help-modal.tsx, "Today and Summary").
                      *(moved 2026-08-04.)* */}
            {props.derivedInfo && (
              <span className={styles['titleInfo']}>
                <InfoBadge label={`About ${props.derivedInfo.title}`}>
                  {props.derivedInfo.about}
                </InfoBadge>
              </span>
            )}
            {/* docs/specs/list-kinds.md — the sparkle. A list whose
                      name Fold recognises behaves differently, and that is
                      invisible until it surprises you; this is the thing
                      you hover to find out why. The nav carries the same
                      glyph as a bare marker, and this one carries the
                      explanation. *(added 2026-08-05, issue #27.)* */}
            {props.kindInfo && (
              <span className={styles['titleInfo']}>
                <InfoBadge
                  label={`About this ${props.kindInfo.label.toLowerCase()}`}
                  icon={LuSparkles}
                >
                  <strong>{props.kindInfo.label}.</strong>{' '}
                  {props.kindInfo.description}
                </InfoBadge>
              </span>
            )}
          </span>
        </h1>
        <span className={styles['headerSpacer']} aria-hidden="true" />
      </div>
      {/* docs/specs/ui.md — the header: how much is in this view,
                under the title rather than beside it. Beside would break
                the title's centring, which balances the ☰ against
                `.headerSpacer` — a count of changing width ("3 todos" vs
                "128 todos") would shift the title sideways every time a
                todo was ticked. `role="status"` so the change is announced
                rather than only seen. *(added 2026-08-04.)* */}
      {/* Always rendered, so the header's height is the same before
                and after the todos arrive — a conditional line pushed the
                whole list down the moment it appeared. While the count is
                unknown this is a skeleton bar of the same height, and the
                text replaces it in place. *(added 2026-08-04.)* */}
      <p className={styles['count']} role="status">
        {props.viewCount ?? (
          <span className={styles['countSkeleton']} aria-hidden="true" />
        )}
      </p>
      {/* docs/specs/list-kinds.md — whole-list actions, under the
                count rather than beside the title: like the count, they
                describe the list rather than name it, and putting them on
                the title row would unbalance its centring (see the note
                on `.count`). Renders nothing for a list with no kind, or
                one with nothing left to act on.
                *(added 2026-08-05, issue #27.)* */}
      {props.activeList && (
        <BulkActions
          listId={props.activeList.id}
          listName={props.activeList.displayName}
          active={props.listActiveTodos}
        />
      )}
      {/* docs/specs/list-filter.md — the list filter is in the nav,
                not here: it hides nav rows as well as todos, and this
                header column was already title + count + actions deep.
                *(moved 2026-08-05.)* */}
    </div>
  )
}
