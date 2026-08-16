import { describe, expect, it } from 'vitest'
import { todoListSchema } from '../src/list'

const base = { id: 'l', href: '/l/', displayName: 'List', ctag: 'c' }

// docs/specs/lists.md — colours and ordering are optional: a collection
// may carry neither, and a server may ignore them entirely.
describe('todoListSchema', () => {
  it('accepts a list with no colour and no order', () => {
    const parsed = todoListSchema.parse(base)
    expect(parsed.color).toBeUndefined()
    expect(parsed.order).toBeUndefined()
  })

  it('accepts a colour and an order', () => {
    const parsed = todoListSchema.parse({
      ...base,
      color: '#1D9BF6',
      order: 3,
    })
    expect(parsed.color).toBe('#1D9BF6')
    expect(parsed.order).toBe(3)
  })

  it('rejects a colour that is not a stored 6-digit hex', () => {
    // Normalization happens at the boundary (parseListColor); by the time
    // a value reaches the schema it must already be in our stored form.
    expect(() =>
      todoListSchema.parse({ ...base, color: '#1D9BF6FF' }),
    ).toThrow()
    expect(() => todoListSchema.parse({ ...base, color: 'red' })).toThrow()
  })

  it('rejects a non-integer order', () => {
    expect(() => todoListSchema.parse({ ...base, order: 1.5 })).toThrow()
  })
})
