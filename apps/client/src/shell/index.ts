/**
 * The app frame: the screen itself, its parts, the hooks that hold its
 * state and the contexts they are published through.
 *
 * Deliberately *not* exported to the domains — `shell` imports `todos`,
 * `lists` and `ui`, never the reverse. This barrel is for the entry point
 * and for shell's own parts.
 */
export { MainScreen } from './main-screen/main-screen'
