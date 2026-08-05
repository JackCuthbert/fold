import { LuChevronRight, LuSparkles } from 'react-icons/lu'
import { cx } from '../styles/cx'
import type { TodoGroup } from './group-by-list'
import styles from './group-row.module.css'

/**
 * A grouping list's todos, collapsed to one row in a derived view
 * (docs/specs/list-kinds.md — grouping in derived views).
 *
 * **It navigates, it does not expand.** Clicking goes to the list, the
 * same as clicking it in the sidebar. Disclosing the items inline would
 * rebuild the row-per-item view that grouping exists to avoid — and the
 * list is where you work through them one at a time anyway.
 *
 * The chevron says so: it points the way out of this view rather than
 * down into a panel, which is what the Completed accordion's own chevron
 * means a few rows below. The two must not look like the same control.
 */
export function GroupRow(props: {
  group: TodoGroup
  onOpenList: (listId: string) => void
}) {
  const count = props.group.todos.length
  // Struck through only when the whole group is finished. A part-done
  // group is still outstanding — the row stands for the errand, and the
  // errand isn't done until the last item is. In Summary every todo is
  // completed by definition, so the row always strikes there; in Today's
  // active half it never does.
  const done = props.group.todos.every((todo) => todo.completed)
  return (
    <li className={cx(styles['row'], done && styles['done'])}>
      <button
        type="button"
        className={styles['button']}
        onClick={() => props.onOpenList(props.group.listId)}
      >
        {/* Wrapped, not styled directly: the span is the checkbox-sized
            column that positions the row's text, and the glyph is
            centred inside it — sizing the SVG itself to --hit-area would
            draw a 44px sparkle.

            Drawn at the checkbox's own size rather than a smaller
            annotation size. Both are centred in the same 44px column, so
            a narrower glyph starts further right: at 14px against the
            20px ring the two left edges were 3px apart — measured in the
            e2e spec, invisible until you look for it.
            *(fixed 2026-08-05.)* */}
        <span className={styles['sparkle']} aria-hidden="true">
          <LuSparkles className={styles['sparkleGlyph']} />
        </span>
        {/* Two boxes, not one: the outer takes the row's slack (so the
            count sits at the trailing edge) and the inner hugs the text
            (so the strikethrough measures the word rather than the gap
            after it). See `.nameText`. */}
        <span className={styles['name']}>
          <span className={styles['nameText']}>{props.group.listName}</span>
        </span>
        {/* "todos", the word used everywhere else for the same thing —
            "items" was a second name for one concept.
            *(changed 2026-08-05.)* */}
        <span className={styles['count']}>
          {count} {count === 1 ? 'todo' : 'todos'}
        </span>
        <LuChevronRight
          className={styles['chevron']}
          aria-hidden="true"
          size={16}
        />
      </button>
    </li>
  )
}
