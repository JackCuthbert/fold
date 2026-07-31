import { useSyncExternalStore } from 'react'
import { playPop as pop } from './pop'

const KEY = 'caldav-todo-muted'
const listeners = new Set<() => void>()

const isMuted = (): boolean => localStorage.getItem(KEY) === '1'

export function useSound() {
  const muted = useSyncExternalStore((onChange) => {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  }, isMuted)
  return {
    muted,
    toggleMuted: (): void => {
      localStorage.setItem(KEY, muted ? '0' : '1')
      for (const listener of listeners) listener()
    },
    playPop: (): void => {
      if (!isMuted()) void pop()
    },
  }
}
