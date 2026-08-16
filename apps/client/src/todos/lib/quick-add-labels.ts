// docs/specs/quick-add.md — the preview pills' labels.
//
// Pure formatting, in the domain's `lib/` rather than beside the modal:
// they take a value and a reference instant and return a string, with no
// React and no component state, so they are testable on their own and the
// modal is shorter for their absence (CLAUDE.md — non-components stay flat
// in `lib/`). *(extracted 2026-08-15 from quick-add-modal.tsx.)*

/**
 * The date pill's label: "Today" / "Tomorrow" for the two days that have
 * names, an absolute date beyond that.
 *
 * Split from the time so each pill says only its own half — a single
 * "Tomorrow 3:00pm" label could not belong to two controls.
 * *(split 2026-08-14, when date and time became separate pills.)*
 */
export function formatDay(value: string, now: Date): string {
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
  // The year, but only when it is not this one. `15 may` typed in August
  // resolves to next May — chrono reads a bare date forwards — and without
  // the year the pill said "Fri, 15 May", which reads as *this* May, three
  // months past. The one case where the year matters is exactly the case
  // where it differs, so it appears there and nowhere else rather than
  // adding noise to every date. *(added 2026-08-14, found in review.)*
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/**
 * The time pill's label, in the viewer's own clock convention.
 *
 * The same `toLocaleTimeString` options the row's due pill and the
 * schedule menu use, so one time reads one way across the app.
 */
export function formatTime(value: string): string {
  const [hour, minute] = value.split(':').map(Number)
  const at = new Date()
  at.setHours(hour ?? 0, minute ?? 0, 0, 0)
  return at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
