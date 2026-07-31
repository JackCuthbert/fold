// Synthesized completion pop — no audio assets (docs/specs/ui.md — sound).
//
// docs/specs/ui.md — sound: two defects fixed here.
// 1. Browsers create an AudioContext *suspended* until a user gesture; a
//    cached suspended context stays silent for the rest of the session, so
//    every play must resume() it first.
// 2. Reduced motion is a vestibular preference about movement, not sound —
//    it must not gate the audio path. The mute toggle (use-sound.ts) is the
//    user's actual control for that.
let context: AudioContext | null = null

export async function playPop(): Promise<void> {
  context ??= new AudioContext()
  if (context.state === 'suspended') await context.resume()
  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(520, now)
  oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.09)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.15)
}
