export type NotificationCopy = {
  viewportLabel: string
  dismissLabel: string
  actionHint: string
  levels: Record<'success' | 'info' | 'debug' | 'warning' | 'error', string>
}
