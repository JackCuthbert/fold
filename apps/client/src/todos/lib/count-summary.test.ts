import type { Todo } from '@fold/schemas'
import { describe, expect, it } from 'vitest'
import { countSummary } from './count-summary'

const todo = (uid: string, completed = false): Todo => ({
  uid,
  listId: 'list-1',
  href: `/l/${uid}.ics`,
  etag: `"${uid}"`,
  summary: uid,
  completed,
})

describe('countSummary', () => {
  it('counts what is left to do, not the total', () => {
    expect(countSummary([todo('a'), todo('b'), todo('c', true)])).toBe(
      '2 todos · 1 done',
    )
  })

  // Completed is only worth the words once there is some.
  it('omits the done half when nothing is completed', () => {
    expect(countSummary([todo('a'), todo('b')])).toBe('2 todos')
  })

  it('says the empty case in words rather than a zero', () => {
    expect(countSummary([])).toBe('No todos')
  })

  it('is singular for one', () => {
    expect(countSummary([todo('a')])).toBe('1 todo')
    expect(countSummary([todo('a'), todo('b', true)])).toBe('1 todo · 1 done')
  })

  // A finished list is not an empty one, so "No todos" would erase the
  // work — but "0 todos · 2 done" reads as a bug rather than a state. The
  // done count alone already says the view isn't empty.
  it('drops the zero when everything is done', () => {
    expect(countSummary([todo('a', true), todo('b', true)])).toBe('2 done')
    expect(countSummary([todo('a', true)])).toBe('1 done')
  })

  // Silence, not a claim. Rendering "No todos" before the todos arrive
  // states the opposite of what is about to appear — and on a cold load
  // that is exactly what happened, for several frames, before correcting
  // itself. The caller decides what "pending" means (use-view-count.ts);
  // this only has to stay quiet when told.
  it('renders nothing while the todos are still unknown', () => {
    expect(countSummary(undefined)).toBeNull()
    expect(countSummary([], { pending: true })).toBeNull()
    expect(countSummary([todo('a')], { pending: true })).toBeNull()
  })

  // The distinction the pending flag exists to draw: an empty array means
  // "no todos" only once the fetch has actually resolved.
  it('separates "not loaded yet" from "loaded and empty"', () => {
    expect(countSummary([], { pending: true })).toBeNull()
    expect(countSummary([], { pending: false })).toBe('No todos')
  })
})
