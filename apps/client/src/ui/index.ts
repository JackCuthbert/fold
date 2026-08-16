/**
 * Generic UI primitives — no domain knowledge.
 *
 * Everything here knows only Base UI and the design tokens; nothing in it
 * imports todos, lists or sync. That is what makes it safe to re-export as
 * one module: no domain can import `ui` and be imported *by* it, so this
 * barrel cannot create a cycle (CLAUDE.md — barrels).
 */
export { ConfirmDialog } from './confirm/confirm'
export { InfoBadge } from './info-badge/info-badge'
export { ModalHeader } from './modal-header/modal-header'
export { StatusDot, type StatusKind } from './status-dot/status-dot'
export { StatusPill } from './status-pill/status-pill'
export { ToastProvider, useToast } from './toast/toast'
