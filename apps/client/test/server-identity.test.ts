import { beforeEach, describe, expect, it } from 'vitest'
import {
  outboxKeyFor,
  readServerIdentity,
  rememberServerIdentity,
  serverIdentity,
} from '../src/lib/server-identity'

const store = (): Storage => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('serverIdentity', () => {
  it('distinguishes two servers', () => {
    expect(
      serverIdentity({ serverUrl: 'https://a.example/', username: 'jack' }),
    ).not.toBe(
      serverIdentity({ serverUrl: 'https://b.example/', username: 'jack' }),
    )
  })

  // The same URL can serve different accounts, so the username is part of
  // the identity — otherwise switching accounts on one host would hydrate
  // the other account's todos.
  it('distinguishes two accounts on one server', () => {
    expect(
      serverIdentity({ serverUrl: 'https://a.example/', username: 'jack' }),
    ).not.toBe(
      serverIdentity({ serverUrl: 'https://a.example/', username: 'sam' }),
    )
  })

  it('is stable for the same server and account', () => {
    const one = serverIdentity({
      serverUrl: 'https://a.example/',
      username: 'jack',
    })
    const two = serverIdentity({
      serverUrl: 'https://a.example/',
      username: 'jack',
    })
    expect(one).toBe(two)
  })

  // A trailing slash is not a different server. Without this, signing in
  // as `https://a.example` after `https://a.example/` would needlessly
  // discard a perfectly valid cache.
  it('ignores a trailing slash and case in the host', () => {
    expect(
      serverIdentity({ serverUrl: 'https://A.example/dav/', username: 'jack' }),
    ).toBe(
      serverIdentity({ serverUrl: 'https://a.example/dav', username: 'jack' }),
    )
  })

  it('keeps a differing path distinct', () => {
    expect(
      serverIdentity({ serverUrl: 'https://a.example/one/', username: 'jack' }),
    ).not.toBe(
      serverIdentity({ serverUrl: 'https://a.example/two/', username: 'jack' }),
    )
  })

  // The identity is written to storage and used in cache keys, so it must
  // not carry the URL or username around in readable form.
  it('does not embed the raw username or url', () => {
    const id = serverIdentity({
      serverUrl: 'https://a.example/',
      username: 'jack',
    })
    expect(id).not.toContain('jack')
    expect(id).not.toContain('a.example')
  })
})

describe('remembering the identity across a reload', () => {
  let storage: Storage

  beforeEach(() => {
    storage = store()
  })

  it('reads back what was remembered', () => {
    const id = serverIdentity({
      serverUrl: 'https://a.example/',
      username: 'jack',
    })
    rememberServerIdentity(id, storage)
    expect(readServerIdentity(storage)).toBe(id)
  })

  it('reads null before any sign-in', () => {
    expect(readServerIdentity(storage)).toBeNull()
  })

  // Hydration must not be blocked by a storage failure — a private-mode
  // browser can throw on write. Losing the buster means the cache is
  // discarded once, which is safe; throwing means the app never mounts.
  it('survives storage that throws', () => {
    const hostile: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      removeItem: () => {},
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(() => rememberServerIdentity('x', hostile)).not.toThrow()
    expect(readServerIdentity(hostile)).toBeNull()
  })
})

describe('outboxKeyFor', () => {
  // The outbox is deliberately preserved across logout so it replays after
  // re-login (docs/specs/authentication.md). That is right for the *same*
  // server; against a different one it would replay creates, edits and
  // deletes against list ids that mean something else there. Namespacing
  // the key preserves both properties at once.
  it('gives each server its own queue', () => {
    const a = serverIdentity({
      serverUrl: 'https://a.example/',
      username: 'jack',
    })
    const b = serverIdentity({
      serverUrl: 'https://b.example/',
      username: 'jack',
    })
    expect(outboxKeyFor(a)).not.toBe(outboxKeyFor(b))
  })

  it('returns the same queue for the same server', () => {
    const a = serverIdentity({
      serverUrl: 'https://a.example/',
      username: 'jack',
    })
    expect(outboxKeyFor(a)).toBe(outboxKeyFor(a))
  })

  // The pre-namespacing key. Anything queued before this change still
  // lives there, and must remain reachable rather than being stranded.
  it('falls back to the legacy key when no server is known', () => {
    expect(outboxKeyFor(null)).toBe('fold-outbox')
  })
})
