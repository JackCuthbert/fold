import type { TodoPriority } from '@fold/schemas'

const WRITE: Record<TodoPriority, number> = { high: 1, medium: 5, low: 9 }

export function priorityToNumber(priority: TodoPriority): number {
  return WRITE[priority]
}

export function priorityFromNumber(value: unknown): TodoPriority | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < 1 || value > 9) return undefined
  if (value <= 4) return 'high'
  if (value === 5) return 'medium'
  return 'low'
}
