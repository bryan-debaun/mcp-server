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

// `userId` scopes the fulfillment to the owner: the REST controller passes the
// caller's JWT sub so a user can only fulfill their own approved request.
export const FulfillResumeDownloadRequestInputSchema = {
    id: z.string().describe('Request id to fulfill (record a download)'),
    userId: z.string().describe('Owning user id; must match the request owner'),
}
