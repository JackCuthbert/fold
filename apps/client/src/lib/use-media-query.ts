import { useSyncExternalStore } from 'react'

/**
 * Tracks a CSS media query via `matchMedia`, kept in sync with
 * `useSyncExternalStore` so it never drifts from the actual viewport (e.g.
 * a window resize crossing the drawer's desktop breakpoint).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
