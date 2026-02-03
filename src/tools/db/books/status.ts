export type ItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

export function normalizeStatusInput(input?: string): ItemStatus | undefined {
    if (!input && input !== '') return undefined
    const s = (input ?? '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-+/g, '_')
    switch (s) {
        case 'NOT_STARTED':
        case 'NOTSTARTED':
        case 'NOT-STARTED':
            return 'NOT_STARTED'
        case 'IN_PROGRESS':
        case 'INPROGRESS':
        case 'IN-PROGRESS':
            return 'IN_PROGRESS'
        case 'COMPLETED':
        case 'FINISHED':
            return 'COMPLETED'
        default:
            return undefined
    }
}

export function statusLabel(status?: ItemStatus | string): string | undefined {
    if (!status) return undefined
    switch (status) {
        case 'NOT_STARTED':
            return 'Not started'
        case 'IN_PROGRESS':
            return 'In progress'
        case 'COMPLETED':
            return 'Completed'
        default:
            return String(status)
    }
}
