/** 提取后端错误信息用于通知 description。 */
export const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error))
