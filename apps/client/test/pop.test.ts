import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// docs/specs/ui.md — sound: two defects fixed here.
// 1. A cached AudioContext stays suspended (browsers create it suspended
//    until a user gesture) unless resumed before each play.
// 2. prefers-reduced-motion must never gate audio — only the mute toggle
//    (use-sound.ts) may.
// This can't be verified by ear in an agent, so it's proven instead: the
// context must be 'running' at play time, and the oscillator must start
// exactly once per completed play — regardless of the reduced-motion
// media query, which pop.ts must no longer consult at all.
describe('playPop', () => {
  const startCalls: number[] = []
  let resumeCalls = 0
  let state: 'suspended' | 'running' = 'suspended'

  class FakeAudioContext {
    currentTime = 0
    get state(): 'suspended' | 'running' {
      return state
    }
    resume = vi.fn(async () => {
      resumeCalls += 1
      state = 'running'
    })
    createGain = () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(() => ({ connect: vi.fn() })),
    })
    createOscillator = () => ({
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(() => ({ connect: vi.fn() })),
      start: vi.fn((...args: unknown[]) => {
        startCalls.push(args.length)
      }),
      stop: vi.fn(),
    })
  }

  beforeEach(() => {
    vi.resetModules()
    startCalls.length = 0
    resumeCalls = 0
    state = 'suspended'
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resumes a suspended context before playing, exactly once per play', async () => {
    const { playPop } = await import('../src/sound/pop')

    expect(state).toBe('suspended')
    await playPop()

    expect(resumeCalls).toBe(1)
    expect(state).toBe('running')
    expect(startCalls).toHaveLength(1)
  })

  it('does not re-resume an already-running context on a later play', async () => {
    const { playPop } = await import('../src/sound/pop')

    await playPop()
    await playPop()

    expect(resumeCalls).toBe(1)
    expect(startCalls).toHaveLength(2)
  })

  it('never checks prefers-reduced-motion — only the mute toggle may gate sound', async () => {
    const matchMediaSpy = vi.fn()
    vi.stubGlobal('matchMedia', matchMediaSpy)
    const { playPop } = await import('../src/sound/pop')

    await playPop()

    expect(matchMediaSpy).not.toHaveBeenCalled()
    expect(startCalls).toHaveLength(1)
  })
})
