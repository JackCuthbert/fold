/** Cross-cutting helpers with no React and no domain knowledge. */
export {
  LEGACY_OUTBOX_KEY,
  outboxKeyFor,
  readServerIdentity,
  rememberServerIdentity,
  serverIdentity,
  subscribeServerIdentity,
  type ServerRef,
} from './server-identity'
export {
  LOCAL_KEYS,
  migrateLocalStorage,
  migrateOutbox,
  migrateStorageKeys,
  type AsyncStore,
  type KeyValueStore,
} from './storage-migration'
export { MOUNT_DEADLINE_MS, withDeadline } from './deadline'
