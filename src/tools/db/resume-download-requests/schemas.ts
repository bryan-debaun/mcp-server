// Input schemas for résumé-download-request MCP tools (#139)
import { z } from 'zod'

/** Persisted statuses; `all` is a read-filter convenience meaning "no filter". */
export const ResumeDownloadStatusEnum = z.enum([
    'pending',
    'approved',
    'denied',
    'fulfilled',
    'expired',
])
export const ResumeDownloadReadStatusEnum = z.enum([
    'pending',
    'approved',
    'denied',
    'fulfilled',
    'expired',
    'all',
])

// `userId` / `userEmail` identify the requester. On the REST surface the
// controller injects these from the caller's verified JWT (never the body); as
// raw tool inputs they are explicit so the MCP surface stays a pure function.
export const CreateResumeDownloadRequestInputSchema = {
    userId: z
        .string()
        .describe('Requesting user id (Supabase auth UUID / JWT sub)'),
    userEmail: z.string().describe('Requesting user email'),
    reason: z
        .string()
        .optional()
        .describe('Optional note from the user explaining the request'),
}

export const ListResumeDownloadRequestsInputSchema = {
    status: ResumeDownloadReadStatusEnum.optional().describe(
        'Filter by stored status (default: all)',
    ),
    userId: z.string().optional().describe('Filter to a single user'),
    limit: z
        .number()
        .optional()
        .describe('Maximum number of results (default 50)'),
    offset: z
        .number()
        .optional()
        .describe('Number of results to skip (default 0)'),
}

export const GetResumeDownloadRequestInputSchema = {
    id: z.string().describe('Request id'),
}

export const ApproveResumeDownloadRequestInputSchema = {
    id: z.string().describe('Request id to approve'),
    adminNote: z.string().optional().describe('Optional internal admin note'),
}

export const DenyResumeDownloadRequestInputSchema = {
    id: z.string().describe('Request id to deny'),
    adminNote: z.string().optional().describe('Optional internal admin note'),
}

// Record a download against an approved request. Server-to-server (API-key)
// mutation — the website's download route calls this before serving the PDF, so
// no user identity is needed here; the cap is enforced atomically in the handler.
export const RecordResumeDownloadInputSchema = {
    id: z.string().describe('Request id to record a download against'),
}
