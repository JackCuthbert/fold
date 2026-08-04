import { useEffect, useState } from 'react'
import { isTextEntryTarget } from './shortcuts'

/**
 * Whether the shortcut modifier (Ctrl) is currently held down.
 *
 * docs/specs/ui.md — keyboard shortcuts: the chords printed in the nav are
 * hints, not labels. Shown permanently they are five keycaps of chrome on
 * a page whose whole point is restraint; shown only on demand they teach
 * without shouting.
 *
 * "On demand" is Ctrl itself: hold it and every binding in the nav appears
 * at once. That is the moment you are asking the question — it beats
 * hovering each row in turn to find out what it does, and it costs nothing
 * to discover, since holding the modifier is already step one of using any
 * of them.
 *
 * The listeners are on `window` and include `blur`: a chord that switches
 * app or opens a browser window can eat the keyup, which would otherwise
 * leave the hints stuck on until the next Ctrl press.
 *
 * *(added 2026-08-04.)*
 */
/**
 * How long Ctrl must be held before the hints appear.
 *
 * Ctrl is the first half of every chord in the map, so an instant reveal
 * flashed the whole nav each time one was *used* — the hints strobing on
 * and off during ordinary work, which is the opposite of calm.
 *
 * 400ms separates "reaching for a shortcut I know" from "holding Ctrl to
 * ask what the shortcuts are". A deliberate hold clears it easily; a chord
 * pressed at speed never does. *(added 2026-08-04.)*
 */
const HOLD_DELAY_MS = 400

export function useModifierHeld(): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Tracked here rather than read from `held`, which the effect closes
    // over once and would see as permanently false.
    let shown = false
    // Cancels a pending reveal as well as hiding a shown one, so a chord
    // completed inside the delay never flashes.
    const cancel = (): void => {
      clearTimeout(timer)
      timer = undefined
      shown = false
      setHeld(false)
    }

    const down = (event: KeyboardEvent): void => {
      // Silent while typing. The shortcuts themselves stand down when a
      // field has focus (shortcuts.ts — isTextEntry), so advertising them
      // there would promise something that will not happen — and Ctrl is
      // half of plenty of ordinary editing chords, so the nav lit up
      // mid-sentence. *(fixed 2026-08-04.)*
      if (isTextEntryTarget(event.target)) return
      if (!event.ctrlKey) return
      // Nothing pressed *while* Ctrl is down ends the reveal — only
      // letting go of Ctrl does. Earlier versions cancelled on the second
      // key, on the theory that a fired chord had answered the question;
      // in use that just meant the hints vanished the instant you did the
      // thing they were describing, and firing a second chord from the
      // same hold was impossible.
      // *(fixed 2026-08-04, twice: first any second key cancelled, then
      // every key but Shift did.)*
      //
      // The guard below is only about not restarting the countdown:
      // keydown auto-repeats while a key is held, so re-arming the timer
      // on each repeat would mean it never elapsed.
      if (timer !== undefined || shown) return
      timer = setTimeout(() => {
        shown = true
        setHeld(true)
      }, HOLD_DELAY_MS)
    }
    const up = (event: KeyboardEvent): void => {
      if (!event.ctrlKey) cancel()
    }
    // Releasing focus (a shortcut that opened something, cmd-tab, a
    // devtools window) can swallow the keyup entirely.
    // Landing in a field with the modifier already down would otherwise
    // leave the hints stuck on for as long as you typed. `focusin`
    // bubbles, unlike `focus`.
    const onFocusIn = (event: FocusEvent): void => {
      if (isTextEntryTarget(event.target)) cancel()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', cancel)
    window.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('focusin', onFocusIn)
      // A pending reveal must not fire into an unmounted component.
      clearTimeout(timer)
    }
  }, [])

  return held
}
