// Lazy expiry: an `approved` request whose 72h window has elapsed is treated as
// `expired` at read time. The service has no scheduler, so we never persist the
// `expired` transition — reads derive it. Persisted status stays `approved` (or
// `fulfilled`) so an admin can still see when/why it was granted.

type ExpirableRequest = { status: string; expiresAt: Date | string | null }

/** True when an approved request's download window has elapsed. */
export function isExpired(
    req: ExpirableRequest,
    now: number = Date.now(),
): boolean {
    if (req.status !== 'approved' || !req.expiresAt) return false
    return new Date(req.expiresAt).getTime() < now
}

/** Return the request with its effective (lazily-computed) status for display. */
export function withEffectiveStatus<T extends ExpirableRequest>(
    req: T,
    now: number = Date.now(),
): T {
    return isExpired(req, now) ? { ...req, status: 'expired' } : req
}
