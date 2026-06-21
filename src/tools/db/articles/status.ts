/** Read visibility for articles. `all` means both draft and published. */
export type ArticleReadStatus = 'draft' | 'published' | 'all'

/**
 * Build the Prisma status filter for a read. Defaults to `published` (the safe
 * public view); `all` returns an empty filter (both statuses). Callers gate
 * non-published access by admin auth before passing `draft`/`all` here.
 */
export function statusFilter(status?: string): {
    status?: 'draft' | 'published'
} {
    const s = status ?? 'published'
    return s === 'all' ? {} : { status: s as 'draft' | 'published' }
}
