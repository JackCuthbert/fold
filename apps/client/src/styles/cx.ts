/**
 * Joins class names, dropping falsy values. CSS Module imports are typed
 * with an index signature (`string | undefined`), which under
 * `exactOptionalPropertyTypes` can't be passed directly as `className` to
 * components (like Base UI's) whose `className` prop excludes `undefined`
 * from its union. This narrows back to `string`.
 */
export function cx(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(' ')
}
