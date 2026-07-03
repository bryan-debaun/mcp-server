// Shared constants for the gated résumé-download flow (#139).

/** Max requests a single user may create within the trailing window. */
export const RESUME_QUOTA_MAX = 3
/** Trailing window (days) the quota is measured over. */
export const RESUME_QUOTA_WINDOW_DAYS = 30
/** Hours an approval stays downloadable before it expires. */
export const RESUME_APPROVAL_WINDOW_HOURS = 72
/** Max downloads permitted per approval before the request is fulfilled (#145). */
export const RESUME_MAX_DOWNLOADS = 3
