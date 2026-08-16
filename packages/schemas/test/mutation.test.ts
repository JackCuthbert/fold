import { describe, expect, it } from 'vitest'
import { mutationSchema } from '../src/mutation'

const id = '11111111-1111-4111-8111-111111111111'

// docs/specs/lists.md — one mutation kind covers both properties: they are
// written by the same PROPPATCH to the same namespace.
describe('setListProps', () => {
  it('accepts a colour alone', () => {
    const parsed = mutationSchema.parse({
      id,
      kind: 'setListProps',
      listId: 'l',
      color: '#1D9BF6',
    })
    expect(parsed.kind).toBe('setListProps')
  })

  it('accepts an order alone', () => {
    const parsed = mutationSchema.parse({
      id,
      kind: 'setListProps',
      listId: 'l',
      order: 2,
    })
    expect(parsed.kind).toBe('setListProps')
  })

  it('accepts clearing a colour', () => {
    // null means "remove the property", distinct from undefined
    // ("leave it alone") — the same distinction todoChangesSchema makes.
    const parsed = mutationSchema.parse({
      id,
      kind: 'setListProps',
      listId: 'l',
      color: null,
    })
    expect(parsed.kind).toBe('setListProps')
  })

  it('rejects a mutation that changes nothing', () => {
    expect(() =>
      mutationSchema.parse({ id, kind: 'setListProps', listId: 'l' }),
    ).toThrow()
  })
})
