// docs/specs/list-kinds.md — a list's name says what kind of list it is.
//
// Everything about kinds lives in this file: the names that match, the
// behaviours each kind unlocks, and the prose that explains it. A kind is
// never stored — not on the server, not locally — so this is the single
// place where "what kind is this list" is answered, and the whole feature
// is greppable from one screen.

/** The closed set of recognised kinds. */
export type ListKind =
  | 'GROCERY_LIST'
  | 'CHORES_LIST'
  | 'MEDIA_LIST'
  | 'HEALTH_LIST'

/**
 * What a kind can do. Read by the views rather than switching on the kind
 * itself, so a new kind that groups declares `groups: true` and every
 * grouping site works without being found and edited.
 */
export interface KindFeatures {
  /** Collapse this list's todos into one row in Today and Summary. */
  groups: boolean
  /** Offer "complete every active todo in this list". */
  bulkComplete: boolean
  /** Offer "give every active todo the same due date". */
  bulkSchedule: boolean
  /**
   * Hide the due-date fields entirely — this is a list of things to get
   * to, not things due by a deadline.
   *
   * Hidden rather than disabled: a greyed-out field says "you can't set
   * this here", which invites the question why. Absent says the concept
   * does not apply, which is the truth for a reading list.
   */
  noDueDates: boolean
}

interface KindDefinition {
  /**
   * Names that match, lowercase. Compared for **whole-name equality**, not
   * containment — see the spec: "Weekend Shopping List" and "Stop shopping
   * impulsively" both contain "shopping" and mean quite different things,
   * and a rule that changes a list's behaviour has to be predictable from
   * the name alone.
   */
  names: readonly string[]
  /** Human name for the kind, used in the sparkle's explanation. */
  label: string
  /** What the popover says this list does. One sentence per behaviour. */
  description: string
  features: KindFeatures
}

const NONE: KindFeatures = {
  groups: false,
  bulkComplete: false,
  bulkSchedule: false,
  noDueDates: false,
}

const DEFINITIONS: Record<ListKind, KindDefinition> = {
  GROCERY_LIST: {
    names: ['groceries', 'grocery', 'shopping'],
    label: 'Grocery list',
    description:
      'Its todos are grouped into a single row in Today and Summary — ' +
      'the shopping is one errand, not one task per item. You can also ' +
      'tick off the whole list at once.',
    features: { ...NONE, groups: true, bulkComplete: true },
  },
  CHORES_LIST: {
    names: ['chores', 'chore'],
    label: 'Chores list',
    description:
      'You can tick off the whole list at once, or give every todo in it ' +
      'the same due date — a Saturday’s jobs are all due Saturday.',
    features: { ...NONE, bulkComplete: true, bulkSchedule: true },
  },
  MEDIA_LIST: {
    names: [
      'reading',
      'to-read',
      'to read',
      'watching',
      'to-watch',
      'to watch',
      'listening',
      'to-listen',
      'to listen',
    ],
    label: 'Reading list',
    description:
      'A list of things to get to rather than things due by a date, so ' +
      'its todos have no due date — set a priority instead to say what ' +
      'is next.',
    features: { ...NONE, noDueDates: true },
  },
  HEALTH_LIST: {
    names: ['health', 'wellbeing', 'well-being'],
    label: 'Health list',
    description:
      'Recognised as health-related. No behaviour is attached to it yet.',
    features: NONE,
  },
}

/**
 * Every (name, kind) pair, flattened once at module load.
 *
 * Built from DEFINITIONS rather than written out so the two cannot
 * disagree. A duplicate name across two kinds would be a silent
 * last-one-wins bug here, so `assertNoDuplicateNames` below makes it a
 * test failure instead — "one kind per list" is a property of the data,
 * and this is what holds it true.
 */
/**
 * The kinds, as a typed list.
 *
 * `Object.keys` widens to `string[]`, and narrowing it back needs an
 * assertion the type-aware lint rightly rejects (CLAUDE.md — fix
 * findings, don't suppress them). Writing the keys out once keeps the
 * types honest; the test below fails if this list and DEFINITIONS ever
 * disagree.
 */
export const LIST_KINDS = [
  'GROCERY_LIST',
  'CHORES_LIST',
  'MEDIA_LIST',
  'HEALTH_LIST',
] as const satisfies readonly ListKind[]

const BY_NAME = new Map<string, ListKind>()
for (const kind of LIST_KINDS) {
  for (const name of DEFINITIONS[kind].names) BY_NAME.set(name, kind)
}

/**
 * Names claimed by more than one kind. Empty in a healthy build.
 *
 * Exported for the unit test rather than run at import time: a throw here
 * would take down the app on a typo, which is a worse failure than the
 * ambiguity it guards against.
 */
export function duplicateKindNames(): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const kind of LIST_KINDS) {
    for (const name of DEFINITIONS[kind].names) {
      if (seen.has(name)) duplicates.push(name)
      seen.add(name)
    }
  }
  return duplicates
}

/**
 * Kinds defined but missing from `LIST_KINDS`. Empty in a healthy build.
 *
 * `LIST_KINDS` is written out by hand to keep the types honest, so it can
 * fall behind `DEFINITIONS` — and a kind missing from it is invisible to
 * every lookup rather than being a type error. Exported for the test.
 */
export function unlistedKinds(): string[] {
  return Object.keys(DEFINITIONS).filter(
    (kind) => !LIST_KINDS.some((known) => known === kind),
  )
}

/**
 * The kind of a list, from its display name — or `null` for the ordinary
 * case, which is most lists.
 *
 * Case-insensitive and whitespace-trimmed, whole name only.
 */
export function listKindOf(displayName: string): ListKind | null {
  return BY_NAME.get(displayName.trim().toLowerCase()) ?? null
}

/** What this list can do. All-false for a list with no recognised kind. */
export function featuresOf(displayName: string): KindFeatures {
  const kind = listKindOf(displayName)
  return kind ? DEFINITIONS[kind].features : NONE
}

/** Label and prose for the sparkle's popover, or `null` if unmarked. */
export function kindExplanation(
  displayName: string,
): { label: string; description: string } | null {
  const kind = listKindOf(displayName)
  if (!kind) return null
  const { label, description } = DEFINITIONS[kind]
  return { label, description }
}
