import { describe, expect, it } from 'vitest'
import { seal, unseal } from '../src/crypto/seal'

const SECRET = 'a-test-secret-at-least-16-chars'

describe('seal/unseal', () => {
  it('round-trips plaintext', async () => {
    const sealed = await seal('hello world', SECRET)
    expect(sealed).not.toContain('hello')
    expect(await unseal(sealed, SECRET)).toBe('hello world')
  })

  it('produces a different ciphertext each time (fresh IV)', async () => {
    expect(await seal('x', SECRET)).not.toBe(await seal('x', SECRET))
  })

  it('returns null for a tampered payload', async () => {
    const sealed = await seal('hello', SECRET)
    const tampered = `${sealed.slice(0, -2)}AA`
    expect(await unseal(tampered, SECRET)).toBeNull()
  })

  it('returns null for the wrong secret', async () => {
    const sealed = await seal('hello', SECRET)
    expect(await unseal(sealed, 'another-secret-16-chars-long')).toBeNull()
  })

  it('returns null for garbage input', async () => {
    expect(await unseal('not-a-sealed-value', SECRET)).toBeNull()
  })
})
