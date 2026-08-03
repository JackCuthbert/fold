import type { Theme } from './lists/list-color'
import { useMediaQuery } from './use-media-query'

/**
 * Which paper the app is currently on — needed by the list-colour
 * contrast guard (docs/specs/lists.md). The app follows the OS setting and
 * has no in-app theme switch, so this is a single media query.
 */
export function useTheme(): Theme {
  return useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light'
}
