import { Dialog } from '@base-ui/react/dialog'
import { Menu } from '@base-ui/react/menu'
import { Popover } from '@base-ui/react/popover'
import type { NewTodo, TodoList, TodoPriority } from '@fold/schemas'
import Fuse from 'fuse.js'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { LuCheck, LuChevronDown, LuCircleHelp, LuPlus } from 'react-icons/lu'
import { cx } from '../../styles/cx'
import { fieldsToDue } from '../lib/due-fields'
import { featuresOf } from '../../lists/lib/list-kind'
import { PRIORITY_CHOICES, priorityChoice } from '../lib/priority-choices'
import {
  parseQuickAdd,
  replaceToken,
  type QuickAddToken,
} from '../lib/quick-add'
import styles from './quick-add-modal.module.css'

/**
 * Quick add (docs/specs/quick-add.md) — one field that creates a todo.
 *
 * A launcher rather than a form: the input, and a line under it echoing
 * what the text was understood to mean. There is no Add button, no
 * accordion, and no field per property, because the whole complaint this
 * answers is that a todo with a due date and a priority costs six
 * interactions to state in two seconds of typing.
 *
 * **The echo is read-only.** Editable chips were rejected in the spec: a
 * chip that can be changed independently of the text puts two sources of
 * truth on screen, and there is no pleasant rule for what happens when the
 * text says `tomorrow` and the chip says Friday. A mistake is corrected
 * where it was made.
 */
interface QuickAddModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: readonly TodoList[]
  /** The list on screen, used when the text names none. */
  defaultListId?: string | undefined
  onAdd: (listId: string, todo: NewTodo) => void
  /** Focus returns here on close — see AddTodoModal for why it is explicit. */
  triggerRef: RefObject<HTMLButtonElement | null>
}

export function QuickAddModal(props: QuickAddModalProps) {
  const [text, setText] = useState('')
  // Notes, the one thing the grammar deliberately does not cover — prose
  // does not belong on a line with tokens in it. Tab from the input
  // reaches it, and it stays collapsed until then so the common case is
  // still one field. *(added 2026-08-14.)*
  const [notes, setNotes] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  // Held in state rather than recomputed: a new example every render would
  // change the placeholder as you type into an empty field.
  const [example, setExample] = useState(randomExample)
  // Enter has been pressed at least once. The list pill only marks itself
  // as needed after that — see the comment where it is rendered.
  const [triedToSubmit, setTriedToSubmit] = useState(false)
  // Which autocomplete row is active. `null` means the menu is closed —
  // one value rather than an `open` flag plus an index, so the two can
  // never disagree about whether a row is highlighted.
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  // Where to put the caret after a pill rewrites the text. A ref rather
  // than state: it is consumed once by the effect below and must not
  // itself cause a render.
  const caretTo = useRef<number | null>(null)

  // One instant per render, so the date a preview shows and the date that
  // gets written cannot straddle midnight (docs/specs/quick-add.md).
  const now = new Date()
  const parsed = useMemo(
    () => parseQuickAdd(text, props.lists, now),
    // `now` is deliberately not a dependency: it changes every render by
    // definition, and including it would defeat the memo entirely. The
    // parse is re-run whenever the text or the lists change, which is when
    // its answer can actually differ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, props.lists],
  )

  // The `#token` the caret is currently inside, if any — that is what the
  // autocomplete filters on. Matched at the end of the text before the
  // caret so it only ever fires on the token being typed, not on one
  // completed earlier in the line.
  const listQuery = useMemo(() => activeListQuery(text), [text])

  const fuse = useMemo(
    () =>
      new Fuse(props.lists, {
        keys: ['displayName'],
        threshold: 0.4,
      }),
    [props.lists],
  )

  const suggestions = useMemo(() => {
    if (listQuery === null) return []
    // An empty query — the moment `#` is typed — offers every list rather
    // than nothing, so the menu is a picker before it is a filter.
    if (listQuery === '') return props.lists.slice(0, 6)
    return fuse
      .search(listQuery)
      .slice(0, 6)
      .map((hit) => hit.item)
  }, [listQuery, props.lists, fuse])

  const menuOpen = suggestions.length > 0 && activeIndex !== null

  // Reset when the modal opens, not when it closes: closing animates, and
  // clearing on the way out empties the field in front of the user.
  useEffect(() => {
    if (props.open) {
      setText('')
      setNotes('')
      setNotesOpen(false)
      setActiveIndex(null)
      setTriedToSubmit(false)
      // A fresh example each time it opens, which is what makes it a
      // teaching surface rather than decoration (see EXAMPLES).
      setExample(randomExample())
    }
  }, [props.open])

  // Focus the notes field once it exists.
  //
  // A layout effect keyed on `notesOpen`, not a `requestAnimationFrame` in
  // the trigger's click handler: the dialog's focus trap runs its own
  // restore after the click, so a focus scheduled on the next frame was
  // taken back and the *popup* ended up focused instead of the field.
  // Running before paint puts this after the render that mounts the
  // textarea and ahead of anything the trap does with the click.
  // *(fixed 2026-08-14, found in review: activating "+ Notes" focused the
  // modal rather than the field it revealed.)*
  useLayoutEffect(() => {
    if (notesOpen) notesRef.current?.focus()
  }, [notesOpen])

  // Put the caret where a pill asked for it, once the new value has been
  // rendered. Setting `selectionStart` in the handler would apply it to
  // the *old* value and be overwritten by React's own update.
  useLayoutEffect(() => {
    const at = caretTo.current
    if (at === null) return
    caretTo.current = null
    inputRef.current?.setSelectionRange(at, at)
  }, [text])

  // Grow and shrink the notes field to fit what is in it.
  //
  // `height = 'auto'` first, then `scrollHeight`: without the reset the
  // element's own height floors the measurement, so the field grows on a
  // new line and then never comes back down when one is deleted. That
  // reset-then-measure pair is the whole trick, and the reason this cannot
  // be done in CSS alone.
  //
  // A layout effect keyed on the value, not an `onChange` handler: the
  // height must be correct for *any* way the text changed — the reset when
  // the modal reopens, and a paste as much as a keystroke — and it must
  // land before paint or the field visibly jumps a frame after the
  // character appears. *(added 2026-08-14.)*
  useLayoutEffect(() => {
    const field = notesRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [notes, notesOpen])

  // Opening the menu whenever a `#token` appears, and closing it when the
  // token goes away. Kept in an effect rather than in the keydown handler
  // so it holds however the text changed — paste and autocorrect included.
  useEffect(() => {
    setActiveIndex(listQuery === null ? null : 0)
  }, [listQuery])

  const targetListId = parsed.listId ?? props.defaultListId
  const targetList = props.lists.find((list) => list.id === targetListId)
  // docs/specs/list-kinds.md — a media list's todos have no due date, so a
  // parsed one is dropped rather than written. Shown struck through in the
  // preview so the reason is visible *before* submitting.
  const noDueDates = targetList
    ? featuresOf(targetList.displayName).noDueDates
    : false

  const canSubmit = parsed.summary !== '' && targetListId !== undefined
  // Enter was pressed and there was nowhere to file the todo. One value,
  // read by both the list pill's marker and the footer's message, so the
  // border and the words can never disagree.
  const needsList = triedToSubmit && targetListId === undefined

  const accept = (list: TodoList): void => {
    if (listQuery === null) return
    // Replace the partial token with the full name, and leave a trailing
    // space so typing continues rather than extending the token.
    const start = text.lastIndexOf('#')
    setText(`${text.slice(0, start)}#${list.displayName} `)
    setActiveIndex(null)
    inputRef.current?.focus()
  }

  /**
   * A pill's choice, applied to the **text** rather than to state
   * (docs/specs/quick-add.md — the pills edit the text).
   *
   * The token's spelling matters: `#My Errands` cannot round-trip, because
   * the grammar stops a `#token` at whitespace, so the parse would read
   * `#My` and leave "Errands" in the summary. A name with a space is
   * therefore written with its spaces removed — `#MyErrands` — which the
   * prefix match in `findList` still resolves back to the right list.
   *
   * Focus returns to the input either way: the menu is a detour, not a
   * destination, and the next thing you do is keep typing.
   */
  const setList = (list: TodoList, token: QuickAddToken | undefined): void => {
    const spelling = `#${list.displayName.replace(/\s+/g, '')}`
    const next = replaceToken(text, token, spelling)
    // A trailing space, and the caret after it.
    //
    // Without the space the line *ends* in a `#token`, which is exactly
    // what `activeListQuery` looks for — so choosing a list from the pill
    // immediately reopened the inline picker over the choice just made.
    // The autocomplete's own `accept` always added one; this path did not.
    // The space also means the next thing typed starts a new word rather
    // than extending the list name. *(fixed 2026-08-14, found in review.)*
    const withSpace = next.endsWith(' ') ? next : `${next} `
    setText(withSpace)
    caretTo.current = withSpace.length
    inputRef.current?.focus()
  }

  /**
   * The date and time pills, written back into the text.
   *
   * Both go through one speller so the pair always lands as a single
   * token: a date and a time written separately would be two date matches
   * in the line, and the second would not necessarily attach to the first.
   * `2026-08-25 15:00` is one phrase chrono reads as one instant, and it
   * round-trips — which is the property the whole text-is-the-truth design
   * rests on.
   *
   * Clearing the date clears the time with it, exactly as the edit form's
   * Date switch does (due-controls.tsx): a time with no date is not
   * expressible in DUE.
   */
  const writeDue = (
    date: string,
    time: string,
    token: QuickAddToken | undefined,
  ): void => {
    const spelling = date === '' ? '' : time === '' ? date : `${date} ${time}`
    setText(replaceToken(text, token, spelling))
  }

  const setDate = (date: string, token: QuickAddToken | undefined): void => {
    writeDue(date, date === '' ? '' : (parsed.due?.time ?? ''), token)
  }

  const setTime = (time: string, token: QuickAddToken | undefined): void => {
    // Only reachable with a date already set — the time pill does not
    // render otherwise — so the date is always there to pair with.
    writeDue(parsed.due?.date ?? '', time, token)
  }

  const setPriority = (
    priority: TodoPriority | null,
    token: QuickAddToken | undefined,
  ): void => {
    // `null` is "None", which removes the token rather than writing `p4` —
    // the summary should not carry a token that sets nothing.
    setText(replaceToken(text, token, priority ? PRIORITY_TOKEN[priority] : ''))
    inputRef.current?.focus()
  }

  const submit = (): void => {
    // Recorded before the guard, so a blocked Enter is what turns the list
    // pill's marker on — the attempt is the signal, not the typing.
    setTriedToSubmit(true)
    if (!canSubmit || targetListId === undefined) return
    const due = parsed.due && !noDueDates ? fieldsToDue(parsed.due) : undefined
    const description = notes.trim()
    props.onAdd(targetListId, {
      uid: crypto.randomUUID(),
      summary: parsed.summary,
      ...(due ? { due } : {}),
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(description ? { description } : {}),
    })
    props.onOpenChange(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Ctrl+N/P move the selection, matching readline — the hands stay on
    // the home row through an interaction whose whole point is speed.
    // Arrows do the same, so nothing has to be learned first
    // (docs/specs/quick-add.md).
    const next =
      event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')
    const previous =
      event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')

    if (menuOpen && (next || previous)) {
      event.preventDefault()
      const count = suggestions.length
      const current = activeIndex ?? 0
      setActiveIndex(
        next ? (current + 1) % count : (current - 1 + count) % count,
      )
      return
    }

    if (menuOpen && (event.key === 'Enter' || event.key === 'Tab')) {
      const choice = suggestions[activeIndex ?? 0]
      if (choice) {
        event.preventDefault()
        accept(choice)
      }
      return
    }

    // Esc closes the menu first and the modal second, so dismissing a
    // suggestion never throws away what has been typed.
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault()
      setActiveIndex(null)
      return
    }

    // Tab is deliberately *not* intercepted. It used to open the notes
    // field and focus it, which meant tabbing out of the input silently
    // added a field nobody asked for — adding notes is a deliberate act,
    // and Tab is "move to the next control", not "create one". Native Tab
    // reaches the "+ Notes" button, and Enter or Space there opens it, so
    // the keyboard path is the same deliberate choice the pointer makes.
    // *(changed 2026-08-14, found in review.)*

    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles['backdrop']} />
        <Dialog.Popup className={styles['popup']} finalFocus={props.triggerRef}>
          {/* Named for screen readers without drawing a heading: the
              field's own placeholder is the visible label, and a title bar
              would make this a form again. */}
          <Dialog.Title className={styles['srOnly']}>Add a todo</Dialog.Title>
          <div className={styles['field']}>
            {/* The dimming layer sits *under* a transparent input, so the
                caret and selection stay native while recognised tokens are
                greyed. Both are the same text at the same metrics, so they
                line up exactly. */}
            <div className={styles['shadow']} aria-hidden="true">
              {renderDimmed(text, parsed.tokens)}
            </div>
            <input
              ref={inputRef}
              className={styles['input']}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={example}
              aria-label="Add a todo"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          {/* The `#` autocomplete, floating over the modal rather than
              sitting in its flow.

              It used to be a block between the input and the notes row,
              which pushed everything below it down as you typed and pulled
              it back as the token resolved — the pills jumping under the
              pointer mid-choice. Anchored and absolutely positioned, it
              overlays instead, and it wears the same popup and row styles
              the pill menus use so the two ways of choosing a list look
              like one control. *(changed 2026-08-14, found in review.)* */}
          {menuOpen && (
            <ul className={cx(styles['menuPopup'], styles['inlineMenu'])}>
              {suggestions.map((list, index) => (
                <li key={list.id}>
                  <button
                    type="button"
                    className={cx(
                      styles['menuItem'],
                      index === activeIndex && styles['menuItemActive'],
                    )}
                    // Pointer-down rather than click: the input must not
                    // lose focus before the choice is applied.
                    onMouseDown={(event) => {
                      event.preventDefault()
                      accept(list)
                    }}
                  >
                    <span
                      className={cx(
                        styles['dot'],
                        list.color === undefined && styles['dotEmpty'],
                      )}
                      {...(list.color === undefined
                        ? {}
                        : { style: { background: list.color } })}
                      aria-hidden="true"
                    />
                    {list.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Notes: the one thing the grammar does not cover, because prose
              does not belong on a line with tokens in it
              (docs/specs/quick-add.md — the full form).

              Collapsed until asked for, so the common case is still a
              single field. Tab from the input opens it — Tab is already
              "go to the next thing", so the field it reveals is the next
              thing rather than a new gesture to learn — and the button is
              the same affordance for a finger. */}
          {notesOpen ? (
            <textarea
              ref={notesRef}
              className={styles['notes']}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onKeyDown={(event) => {
                // Enter submits from here too, so notes never cost a reach
                // for the mouse. Shift+Enter is a newline, which is the
                // convention every message box has taught — and is
                // explained in the footer's help popover rather than by a
                // line under this field, which was a second permanent
                // sentence for a rule most people already know.
                // *(moved 2026-08-14.)*
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="Notes"
              aria-label="Notes"
              // One line to start; the effect above grows it from there.
              // `rows={2}` held an empty field two lines tall, which is
              // the reserved space an auto-growing field exists to avoid.
              rows={1}
            />
          ) : (
            <button
              type="button"
              className={styles['notesTrigger']}
              // Activating this *is* the deliberate act — by click, tap,
              // Enter or Space — so focus follows into the field it
              // reveals. Tab alone only moves here; it does not fire.
              // The focusing itself is an effect below, not a callback:
              // see `notesOpen`.
              onClick={() => setNotesOpen(true)}
            >
              <LuPlus aria-hidden="true" size={12} />
              Notes
            </button>
          )}

          <Preview
            parsed={parsed}
            list={targetList}
            lists={props.lists}
            noDueDates={noDueDates}
            now={now}
            needsList={needsList}
            onSetDate={setDate}
            onSetTime={setTime}
            onSetList={setList}
            onSetPriority={setPriority}
          />

          {/* The footer: what went wrong, or what the keys do, and the
              button.

              **A message, not just the marked pill.** Enter used to move
              focus to the list pill and say nothing else, which asks you to
              infer the rule from a border — and on a screen reader said
              nothing at all. `role="alert"` announces it.

              **The hint is a line, not the placeholder**, because a
              placeholder is gone by the time you have typed enough to want
              a second line — exactly when Shift+Enter matters. */}
          <div className={styles['footer']}>
            {/* Everything true at once, rather than one message replacing
                another. "Enter to add" stays true while notes has focus and
                while the list is missing; swapping it out read as the rule
                having *changed* when in fact something was added to it.
                So the Shift line joins it where it applies, and the error
                sits above both rather than in place of them.
                *(changed 2026-08-14: these took turns.)* */}
            <div className={styles['footerMessages']}>
              {needsList && (
                <p
                  className={cx(styles['note'], styles['noteError'])}
                  role="alert"
                >
                  Choose a list for this todo
                </p>
              )}
              {/* The keyboard rules, behind a popover rather than printed
                  in the footer.

                  Two permanent sentences of instruction sat under a modal
                  whose whole argument is restraint, and they were being
                  read every time to say something you learn once. A quiet
                  "Keyboard" trigger keeps the answer one click away for
                  the day you want it and silent afterwards.
                  *(changed 2026-08-14.)* */}
              <Popover.Root>
                <Popover.Trigger className={styles['helpTrigger']}>
                  <LuCircleHelp aria-hidden="true" size={13} />
                  Keyboard
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner
                    className={styles['menuPositioner']}
                    side="top"
                    align="start"
                    sideOffset={6}
                  >
                    <Popover.Popup className={styles['helpPopup']}>
                      <dl className={styles['helpList']}>
                        <dt>
                          <kbd>Enter</kbd>
                        </dt>
                        <dd>Add the todo</dd>
                        <dt>
                          <kbd>Shift</kbd> + <kbd>Enter</kbd>
                        </dt>
                        <dd>A new line, in notes</dd>
                        <dt>
                          <kbd>Esc</kbd>
                        </dt>
                        <dd>Close without adding</dd>
                      </dl>
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </div>
            {/* Enter still submits — this is the same action, reachable by
                a finger. Not disabled when the form is incomplete: a dead
                button explains nothing, while pressing it produces the
                message above. *(added 2026-08-14.)* */}
            <button type="button" className={styles['submit']} onClick={submit}>
              Add todo
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The token each rank is written as — the inverse of the parser's map. */
const PRIORITY_TOKEN: Record<TodoPriority, string> = {
  high: 'p1',
  medium: 'p2',
  low: 'p3',
}

/**
 * Placeholder examples, one picked at random each time the modal opens.
 *
 * The syntax is invisible by design — a plain line makes a plain todo — so
 * the placeholder is the only place it gets taught. One fixed example
 * teaches one shape and then stops being read; rotating through these puts
 * a different combination in front of you each time, so the grammar is
 * absorbed by use rather than looked up.
 *
 * Chosen to cover the whole grammar between them rather than to be varied
 * for its own sake: bare summaries, each token alone, and the combinations.
 * The list names are deliberately generic — a real list is unlikely to be
 * called "errands", so nobody reads a placeholder as a filed todo.
 * *(added 2026-08-14.)*
 */
const EXAMPLES: readonly string[] = [
  'Clean the gutters tomorrow at 3pm #chores p1',
  'Book the dentist next tuesday',
  'Water the plants friday #garden',
  'Renew the car rego 25 Aug p2',
  'Call mum sunday 6pm',
  'Pay the electricity bill in 3 days p1',
  'Take the bins out tonight #chores',
  'Draft the quarterly review next monday p2',
  'Pick up the dry cleaning saturday morning',
  'Send the invoice today p1 #work',
  'Replace the smoke alarm battery next week',
  'Order more coffee beans #groceries',
  'Ring the plumber tomorrow 9am p1',
  'Back up the photos this weekend p3',
  'Renew the passport in 2 weeks',
  'Book flights for the trip next friday p2',
  'Sort out the shed someday',
  'Check the tyre pressures saturday',
]

/** One example, chosen fresh per open — see EXAMPLES. */
function randomExample(): string {
  const index = Math.floor(Math.random() * EXAMPLES.length)
  return EXAMPLES[index] ?? EXAMPLES[0] ?? ''
}

/** The `#token` the caret is inside, or null. */
function activeListQuery(text: string): string | null {
  const match = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u.exec(text)
  return match ? (match[1] ?? '') : null
}

/**
 * The text with recognised tokens wrapped so CSS can dim them.
 *
 * `cursor` only ever moves forwards, and a token starting behind it is
 * skipped. The parser guarantees non-overlapping ranges now, but this is
 * the code that *visibly* broke when it did not: a backwards slice emitted
 * text it had already emitted, so the input read
 * "…#Chores3pm#Chores 3pm" while the value behind it was fine. A render
 * that duplicates the user's own words is worth one guard.
 * *(hardened 2026-08-14, found in review.)*
 */
function renderDimmed(
  text: string,
  tokens: readonly { start: number; end: number }[],
) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const [index, token] of tokens.entries()) {
    if (token.end <= cursor) continue
    const start = Math.max(token.start, cursor)
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(
      <span key={index} className={styles['token']}>
        {text.slice(start, token.end)}
      </span>,
    )
    cursor = token.end
  }
  parts.push(text.slice(cursor))
  return parts
}

interface PreviewProps {
  parsed: ReturnType<typeof parseQuickAdd>
  list: TodoList | undefined
  /** Every list, for the list pill's menu. */
  lists: readonly TodoList[]
  noDueDates: boolean
  now: Date
  /** There is text, but nowhere to file it — see the branch below. */
  needsList: boolean
  /** Rewrite the date half of the due token; `''` clears it. */
  onSetDate: (date: string, token: QuickAddToken | undefined) => void
  /** Rewrite the time half; `''` returns the todo to all-day. */
  onSetTime: (time: string, token: QuickAddToken | undefined) => void
  /** Rewrite the `#list` token, or add one when there is none. */
  onSetList: (list: TodoList, token: QuickAddToken | undefined) => void
  /** Rewrite the `pN` token; `null` clears the priority. */
  onSetPriority: (
    priority: TodoPriority | null,
    token: QuickAddToken | undefined,
  ) => void
}

/**
 * What will be created, in the row's own pill vocabulary
 * (docs/specs/ui.md — two pill treatments) so the preview and the result
 * look like the same thing rather than two descriptions of it.
 */
function Preview(props: PreviewProps) {
  const { parsed } = props
  const priority = parsed.priority ? priorityChoice(parsed.priority) : null

  // No "nothing parsed yet" branch any more: the pills are always drawn,
  // so the row is never empty and there is nothing to fill it with.
  // *(removed 2026-08-14, when the pills became the discoverable path.)*

  const listToken = parsed.tokens.find((token) => token.kind === 'list')
  const priorityToken = parsed.tokens.find((token) => token.kind === 'priority')

  const dueToken = parsed.tokens.find((token) => token.kind === 'date')

  return (
    <div className={styles['preview']}>
      {/* **Every pill is always here**, set or not. An unset one reads
          "Due" / "List" / "Priority" in the placeholder treatment and opens
          the same menu as a set one.

          This is what makes the syntax optional rather than required: the
          grammar is the fast path for someone who knows it, and the pills
          are the complete path for someone who does not. Drawing them only
          once a token had been typed meant you had to already know `p1`
          existed to discover that priority could be set at all.
          *(changed 2026-08-14: pills appeared only when parsed.)*

          **Ordered list, date, time, priority** — widest scope first.
          Where a todo lives outranks when it is due, which outranks the
          hour within that day, which outranks how much it matters; and the
          time pill sits beside the date it depends on. It is also the
          order of how often each is answered, so the eye meets the common
          decisions first. *(ordered 2026-08-14.)* */}
      {/* On a derived view there is no list to default to, so this pill is
          the only way to say where the todo goes. It marks itself rather
          than a hint replacing the whole row: an earlier cut swapped the
          pills for the sentence "Add #list to choose where this goes",
          which hid the control that answers it at the moment you need it.

          **Marked only once you try to submit**, not while typing. Keyed on
          text alone it lit up on the first keystroke and stayed lit, so it
          read as an error the whole time you were writing a perfectly good
          todo — nagging, which is the one thing this app does not do
          (docs/specs/overview.md — product intent). Now it waits until
          Enter has been pressed and could not be honoured.
          *(changed 2026-08-14, found in review.)* */}
      <PillMenu
        label={props.list?.displayName ?? 'List'}
        unset={!props.list}
        className={cx(
          styles['pillList'],
          props.needsList && styles['pillNeeded'],
        )}
        {...(props.list
          ? {
              before: (
                <span
                  className={cx(
                    styles['dot'],
                    props.list.color === undefined && styles['dotEmpty'],
                  )}
                  {...(props.list.color === undefined
                    ? {}
                    : { style: { background: props.list.color } })}
                  aria-hidden="true"
                />
              ),
            }
          : {})}
        title={
          props.list
            ? `List: ${props.list.displayName}. Choose another.`
            : 'Choose a list'
        }
        items={props.lists.map((entry) => ({
          key: entry.id,
          label: entry.displayName,
          // The list's own dot, as everywhere else a list is named
          // (docs/specs/lists.md — wherever a list is named). Without it
          // this menu was the one list picker in the app showing bare
          // names, so the colour you recognise a list by was missing at
          // the moment of choosing one. *(added 2026-08-14.)*
          icon: (
            <span
              className={cx(
                styles['dot'],
                entry.color === undefined && styles['dotEmpty'],
              )}
              {...(entry.color === undefined
                ? {}
                : { style: { background: entry.color } })}
              aria-hidden="true"
            />
          ),
          selected: entry.id === props.list?.id,
          onPick: () => props.onSetList(entry, listToken),
        }))}
      />
      {/* Date and time are **two pills with two pickers**, matching the
          edit form's two fields (due-controls.tsx) rather than offering a
          menu of canned days.

          A fixed list — Today / Tomorrow / This weekend / Next week —
          could only ever cover the days someone thought of in advance, so
          the moment you wanted the 25th it had nothing to say and you were
          back to typing. A picker answers every date, and the two are
          split because a time is a separate decision: most todos are
          all-day, and a date picker that always dragged a time along would
          make "no particular hour" the awkward case.
          *(changed 2026-08-14: was a menu of canned choices.)* */}
      <PillPicker
        label={parsed.due ? formatDay(parsed.due.date, props.now) : 'Date'}
        unset={!parsed.due}
        className={cx(props.noDueDates && styles['pillDropped'])}
        type="date"
        value={parsed.due?.date ?? ''}
        title={parsed.due ? 'Change the date' : 'Set a date'}
        onChange={(value) => props.onSetDate(value, dueToken)}
      />
      {/* The time pill appears only once there is a date, because a time
          without one is not expressible in DUE (docs/specs/todos.md — due
          times). That is the same nesting the edit form uses: its Time
          switch does not exist until a date is set. */}
      {parsed.due && (
        <PillPicker
          label={parsed.due.time === '' ? 'Time' : formatTime(parsed.due.time)}
          unset={parsed.due.time === ''}
          className={cx(props.noDueDates && styles['pillDropped'])}
          type="time"
          value={parsed.due.time}
          title={parsed.due.time === '' ? 'Set a time' : 'Change the time'}
          onChange={(value) => props.onSetTime(value, dueToken)}
        />
      )}
      <PillMenu
        label={priority?.label ?? 'Priority'}
        unset={!priority}
        className={cx(
          parsed.priority && styles[PRIORITY_PILL_CLASS[parsed.priority]],
        )}
        {...(priority ? { before: priority.icon } : {})}
        title={
          priority
            ? `Priority: ${priority.label}. Choose another.`
            : 'Set a priority'
        }
        items={PRIORITY_CHOICES.map((choice) => ({
          key: choice.value ?? 'none',
          label: choice.label,
          // The glyph in its rank's tinted box, exactly as the row's
          // context menu draws the same choices
          // (todo-context-menu.module.css — `.radioIcon`). Passing the
          // bare glyph left every option in plain ink, so the menu that
          // *sets* a priority was the one place not showing its colour.
          // *(fixed 2026-08-14, found in review.)*
          icon: (
            <span
              className={cx(
                styles['prioSwatch'],
                choice.value !== null &&
                  styles[PRIORITY_PILL_CLASS[choice.value]],
              )}
            >
              {choice.icon}
            </span>
          ),
          selected: choice.value === parsed.priority,
          onPick: () => props.onSetPriority(choice.value, priorityToken),
        }))}
      />
    </div>
  )
}

/** Which colour class a rank's pill takes — see the stylesheet. */
const PRIORITY_PILL_CLASS: Record<TodoPriority, string> = {
  high: 'pillHigh',
  medium: 'pillMedium',
  low: 'pillLow',
}

interface PillPickerProps {
  label: string
  unset: boolean
  className: string | undefined
  type: 'date' | 'time'
  /** `yyyy-mm-dd` or `HH:mm`; `''` when unset. */
  value: string
  title: string
  onChange: (value: string) => void
}

/**
 * A pill that *is* a native date or time input
 * (docs/specs/quick-add.md — the pills edit the text).
 *
 * The input is stretched invisibly across the pill rather than shown, so
 * the pill keeps the row's vocabulary while a tap opens the platform's own
 * picker — the same control the edit form uses (due-controls.tsx), which
 * on iOS is the wheel everyone already knows. Building a calendar inside a
 * launcher would be a second date UI to learn and to maintain.
 *
 * The label is what you read; the input is what you touch.
 */
function PillPicker(props: PillPickerProps) {
  return (
    <span
      className={cx(
        styles['pill'],
        styles['pillButton'],
        styles['pillPicker'],
        props.unset && styles['pillUnset'],
        props.className,
      )}
      title={props.title}
    >
      {props.label}
      <LuChevronDown className={styles['pillChevron']} size={12} />
      <input
        type={props.type}
        className={styles['pillPickerInput']}
        value={props.value}
        aria-label={props.title}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </span>
  )
}

interface PillMenuItem {
  key: string
  label: string
  icon?: ReactNode
  selected: boolean
  onPick: () => void
}

interface PillMenuProps {
  label: string
  /**
   * `string | undefined` because a CSS Modules lookup is typed that way
   * under `noUncheckedIndexedAccess`, and `cx` already drops falsy values.
   */
  className: string | undefined
  before?: ReactNode
  /**
   * Nothing has been parsed for this pill yet, so it shows its category
   * name ("Due") in the placeholder treatment rather than a value.
   */
  unset?: boolean
  /** The accessible name — the pill's text alone would not say it opens. */
  title: string
  items: PillMenuItem[]
}

/**
 * A preview pill that opens a menu, and whose choice **rewrites the text**
 * (docs/specs/quick-add.md — the pills edit the text).
 *
 * This is the point that keeps one source of truth: picking "Work" does not
 * store a list beside the text, it edits `#chores` into `#Work` and lets the
 * parse follow. So a pointer and the keyboard drive the same thing, and
 * there is no state that can disagree with what is written.
 *
 * The read-only version shipped first and the spec argued *against* chips
 * on two-sources-of-truth grounds. That argument was about chips that hold
 * their own value; it does not apply to a control that edits the text.
 * *(changed 2026-08-14.)*
 */
function PillMenu(props: PillMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cx(
          styles['pill'],
          styles['pillButton'],
          props.unset && styles['pillUnset'],
          props.className,
        )}
        // `aria-label` as well as `title`: the visible text is the *value*
        // ("Chores"), which does not say which control it belongs to. A
        // title alone is a tooltip — it does not name the button for a
        // screen reader, and an assistive user hears "Chores, button" with
        // no clue it sets the list. *(added 2026-08-14.)*
        aria-label={props.title}
        title={props.title}
      >
        {props.before}
        {props.label}
        <LuChevronDown className={styles['pillChevron']} size={12} />
      </Menu.Trigger>
      <Menu.Portal>
        {/* Below the pill and aligned to its leading edge, so the menu
            hangs off the control that opened it rather than being centred
            under it — the pills sit in a row, and a centred popup reads as
            belonging to whichever pill it happens to overlap. */}
        <Menu.Positioner
          className={styles['menuPositioner']}
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <Menu.Popup className={styles['menuPopup']}>
            {props.items.map((item) => (
              <Menu.Item
                key={item.key}
                className={cx(
                  styles['menuItem'],
                  item.selected && styles['menuItemSelected'],
                )}
                onClick={item.onPick}
              >
                {item.icon}
                {item.label}
                {/* Which one is set. Weight alone was the first cut and is
                    not readable against a single row — and this menu is
                    often opened to *check* the value rather than change
                    it. `aria-hidden` because the row already carries the
                    state for a screen reader (Base UI marks it).
                    *(added 2026-08-14, found in review.)* */}
                {item.selected && (
                  <LuCheck
                    className={styles['menuTick']}
                    size={14}
                    aria-hidden="true"
                  />
                )}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/**
 * The date pill's label: "Today" / "Tomorrow" for the two days that have
 * names, an absolute date beyond that.
 *
 * Split from the time so each pill says only its own half — a single
 * "Tomorrow 3:00pm" label could not belong to two controls.
 * *(split 2026-08-14, when date and time became separate pills.)*
 */
function formatDay(value: string, now: Date): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  for (const [offset, name] of ['Today', 'Tomorrow'].entries()) {
    const candidate = new Date(now)
    candidate.setDate(candidate.getDate() + offset)
    if (
      candidate.getFullYear() === date.getFullYear() &&
      candidate.getMonth() === date.getMonth() &&
      candidate.getDate() === date.getDate()
    ) {
      return name
    }
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * The time pill's label, in the viewer's own clock convention.
 *
 * The same `toLocaleTimeString` options the row's due pill and the
 * schedule menu use, so one time reads one way across the app.
 */
function formatTime(value: string): string {
  const [hour, minute] = value.split(':').map(Number)
  const at = new Date()
  at.setHours(hour ?? 0, minute ?? 0, 0, 0)
  return at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
