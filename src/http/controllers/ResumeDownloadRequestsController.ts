import type { Request as ExpressRequest } from 'express'
import {
    Body,
    Controller,
    Get,
    Patch,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    Security,
    SuccessResponse,
    Tags,
} from 'tsoa'
import { callTool } from '../../tools/local.js'
import {
    httpError,
    isInvalidState,
    isNotFound,
    isQuotaExceeded,
} from './_http-errors.js'

export type ResumeDownloadStatus =
    | 'pending'
    | 'approved'
    | 'denied'
    | 'fulfilled'
    | 'expired'
/** List filter; `all` returns every status. */
export type ResumeDownloadReadStatus = ResumeDownloadStatus | 'all'

export interface ResumeDownloadRequest {
    id: string
    userId: string
    userEmail: string
    reason?: string | null
    status: ResumeDownloadStatus
    adminNote?: string | null
    downloadCount: number
    createdAt: string
    approvedAt?: string | null
    expiresAt?: string | null
}

export interface ListResumeDownloadRequestsResponse {
    requests: ResumeDownloadRequest[]
    total: number
    limit: number
    offset: number
}

export interface CreateResumeDownloadRequestBody {
    /** Optional note from the user explaining the request. */
    reason?: string
}

export interface AdminNoteBody {
    /** Optional internal admin note. */
    adminNote?: string
}

/**
 * Backend for the gated résumé-download flow on bryandebaun.dev (#139).
 *
 * A signed-in user requests the contact-bearing résumé; an admin approves or
 * denies; an approval grants a 72h download window. Identity (`userId`,
 * `userEmail`) is always taken from the caller's verified JWT — never the body —
 * so a user can only act on their own behalf.
 */
@Route('api/resumeDownloadRequests')
@Tags('ResumeDownloadRequests')
export class ResumeDownloadRequestsController extends Controller {
    /**
     * Create a résumé-download request for the authenticated user.
     * Enforces a per-user quota (max 3 in the trailing 30 days) → 429.
     */
    @Post()
    @Security('jwt')
    @SuccessResponse('201', 'Request created')
    @Response('401', 'Unauthorized')
    @Response('429', 'Quota exceeded')
    public async createRequest(
        @Request() request: ExpressRequest,
        @Body() body: CreateResumeDownloadRequestBody,
    ): Promise<ResumeDownloadRequest> {
        const { userId, userEmail } = this.requireUser(request)
        try {
            const result = await callTool('create-resume-download-request', {
                userId,
                userEmail,
                reason: body?.reason,
            })
            this.setStatus(201)
            return result as ResumeDownloadRequest
        } catch (err: any) {
            if (isQuotaExceeded(err)) throw httpError(429, err.message)
            throw err
        }
    }

    /**
     * List résumé-download requests (admin).
     * @param status Filter by stored status (default: all)
     * @param userId Filter to a single user
     * @param limit Maximum number of results (default 50)
     * @param offset Number of results to skip (default 0)
     */
    @Get()
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Requests retrieved')
    public async listRequests(
        @Query() status?: ResumeDownloadReadStatus,
        @Query() userId?: string,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ListResumeDownloadRequestsResponse> {
        const result = await callTool('list-resume-download-requests', {
            status,
            userId,
            limit,
            offset,
        })
        return result as ListResumeDownloadRequestsResponse
    }

    /**
     * Get a résumé-download request by id (admin).
     * @param id Request id
     */
    @Get('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Request retrieved')
    @Response('404', 'Request not found')
    public async getRequest(
        @Path() id: string,
    ): Promise<ResumeDownloadRequest> {
        try {
            const result = await callTool('get-resume-download-request', { id })
            return result as ResumeDownloadRequest
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Request not found')
            throw err
        }
    }

    /**
     * Approve a pending request (admin). Sets approvedAt and a 72h window.
     * @param id Request id
     */
    @Patch('{id}/approve')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Request approved')
    @Response('404', 'Request not found')
    @Response('409', 'Request is not pending')
    public async approveRequest(
        @Path() id: string,
        @Body() body: AdminNoteBody,
    ): Promise<ResumeDownloadRequest> {
        try {
            const result = await callTool('approve-resume-download-request', {
                id,
                adminNote: body?.adminNote,
            })
            return result as ResumeDownloadRequest
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Request not found')
            if (isInvalidState(err)) throw httpError(409, err.message)
            throw err
        }
    }

    /**
     * Deny a pending request (admin).
     * @param id Request id
     */
    @Patch('{id}/deny')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Request denied')
    @Response('404', 'Request not found')
    @Response('409', 'Request is not pending')
    public async denyRequest(
        @Path() id: string,
        @Body() body: AdminNoteBody,
    ): Promise<ResumeDownloadRequest> {
        try {
            const result = await callTool('deny-resume-download-request', {
                id,
                adminNote: body?.adminNote,
            })
            return result as ResumeDownloadRequest
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Request not found')
            if (isInvalidState(err)) throw httpError(409, err.message)
            throw err
        }
    }

    /**
     * Record a download against the caller's own approved request. Increments
     * downloadCount and flips status to fulfilled; only valid within the window.
     * @param id Request id
     */
    @Patch('{id}/fulfill')
    @Security('jwt')
    @SuccessResponse('200', 'Download recorded')
    @Response('401', 'Unauthorized')
    @Response('404', 'Request not found')
    @Response('409', 'Request is not approved or the window has expired')
    public async fulfillRequest(
        @Request() request: ExpressRequest,
        @Path() id: string,
    ): Promise<ResumeDownloadRequest> {
        const { userId } = this.requireUser(request)
        try {
            const result = await callTool('fulfill-resume-download-request', {
                id,
                userId,
            })
            return result as ResumeDownloadRequest
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Request not found')
            if (isInvalidState(err)) throw httpError(409, err.message)
            throw err
        }
    }

    /**
     * Pull the caller's identity from the verified JWT that `expressAuthentication`
     * attached to the request. `@Security('jwt')` guarantees a valid token; we
     * still guard the claims we depend on.
     */
    private requireUser(request: ExpressRequest): {
        userId: string
        userEmail: string
    } {
        const user = (request as any).user
        const userId: string | undefined = user?.sub
        const userEmail: string | undefined = user?.email
        if (!userId) throw httpError(401, 'Token missing subject claim')
        if (!userEmail) throw httpError(400, 'Token missing email claim')
        return { userId, userEmail }
    }
}
