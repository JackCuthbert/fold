import type { VersionInfo } from '@fold/schemas'
import { useQuery } from '@tanstack/react-query'
import { api } from '../providers'

/**
 * The running version, and whether a newer one exists
 * (docs/specs/releases.md).
 *
 * Fetched only when the Help modal is open — `enabled` — because that is
 * the only place it is shown and nothing else in the app depends on it.
 * A version nobody is looking at is not worth a request.
 *
 * `staleTime: Infinity` because the running version cannot change without
 * a reload, and the server already caches its own update check for a day.
 * Reopening the modal re-reads the cache rather than the network.
 *
 * Failure is silent: `undefined` renders nothing (see the Version section
 * in help-modal.tsx). The endpoint is unauthenticated, so this works on
 * the login screen too.
 */
export function useVersion(enabled: boolean): VersionInfo | undefined {
  const { data } = useQuery({
    queryKey: ['version'],
    queryFn: () => api.getVersion(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    // One attempt. Nothing here is worth a retry storm — the whole feature
    // degrades to "no version shown", which is not an error state.
    retry: false,
  })
  return data
}
