/**
 * Shared helpers for classifying tool/callTool errors in HTTP controllers and
 * routes. Centralizes the string-matching so each handler doesn't reinvent it.
 */

/** True when a tool error indicates the entity was not found (vs a real failure). */
export function isNotFound(err: any): boolean {
    return (
        typeof err?.message === 'string' &&
        err.message.toLowerCase().includes('not found')
    )
}

/** True when a tool error indicates a unique-constraint / duplicate violation. */
export function isUniqueViolation(err: any): boolean {
    const m = err?.message
    return (
        typeof m === 'string' &&
        (m.includes('Unique constraint') || m.includes('already exists'))
    )
}

/** True when a tool error indicates a per-user quota was exceeded (→ 429). */
export function isQuotaExceeded(err: any): boolean {
    return (
        typeof err?.message === 'string' &&
        err.message.toLowerCase().includes('quota exceeded')
    )
}

/**
 * True when a tool error indicates the entity is in a state that forbids the
 * requested transition (→ 409), e.g. approving a non-pending request or
 * fulfilling an unapproved/expired one.
 */
export function isInvalidState(err: any): boolean {
    const m = err?.message
    if (typeof m !== 'string') return false
    const lowered = m.toLowerCase()
    return (
        lowered.startsWith('cannot ') ||
        lowered.includes('not approved') ||
        lowered.includes('window has expired')
    )
}

/** Create an Error carrying an HTTP status, for handlers that throw to the framework. */
export function httpError(
    status: number,
    message: string,
): Error & { status: number } {
    const e = new Error(message) as Error & { status: number }
    e.status = status
    return e
}
