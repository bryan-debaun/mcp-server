import {
    Body,
    Controller,
    Get,
    Put,
    Response,
    Route,
    Security,
    SuccessResponse,
    Tags,
} from 'tsoa'
import { callTool } from '../../tools/local.js'
import { httpError, isNotFound, isValidationError } from './_http-errors.js'

/** JSON Resume private contact fields — never returned by the public GET. */
export interface ResumePrivateContact {
    email?: string
    phone?: string
    [key: string]: unknown
}

export interface ResumeBasics {
    name: string
    label?: string
    url?: string
    summary?: string
    privateContact?: ResumePrivateContact
    [key: string]: unknown
}

/** The JSON Resume document. Open-ended (index signatures) — JSON Resume is extensible. */
export interface ResumeDocument {
    basics: ResumeBasics
    work?: unknown[]
    education?: unknown[]
    skills?: unknown[]
    projects?: unknown[]
    [key: string]: unknown
}

export interface ResumeResponse {
    document: ResumeDocument
    updatedAt: string
}

/**
 * DB-backed singleton résumé (ADR-0007 Phase 3, #147).
 *
 * - `GET /api/resume` (API-key) returns the document with `basics.privateContact`
 *   **stripped** — safe to render on the public page.
 * - `GET /api/resume/full` (API-key or admin JWT) returns the full document
 *   including private contact, for the gated render and the PDF generator.
 * - `PUT /api/resume` (admin JWT) replaces the whole document.
 */
@Route('api/resume')
@Tags('Resume')
export class ResumeController extends Controller {
    /** Public résumé — private contact fields removed. */
    @Get()
    @Security('api_key')
    @SuccessResponse('200', 'Résumé retrieved')
    @Response('404', 'Résumé not found')
    public async getResume(): Promise<ResumeResponse> {
        try {
            const result = await callTool('get-resume', {
                includePrivate: false,
            })
            return result as ResumeResponse
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Résumé not found')
            throw err
        }
    }

    /**
     * Full résumé including private contact. Server-to-server (API-key) or admin.
     */
    @Get('full')
    @Security('api_key')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Full résumé retrieved')
    @Response('404', 'Résumé not found')
    public async getResumeFull(): Promise<ResumeResponse> {
        try {
            const result = await callTool('get-resume', {
                includePrivate: true,
            })
            return result as ResumeResponse
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Résumé not found')
            throw err
        }
    }

    /** Replace the singleton résumé document (admin only). */
    @Put()
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Résumé updated')
    @Response('400', 'Invalid résumé document')
    @Response('401', 'Unauthorized')
    public async putResume(
        @Body() body: ResumeDocument,
    ): Promise<ResumeResponse> {
        try {
            const result = await callTool('update-resume', { document: body })
            return result as ResumeResponse
        } catch (err: any) {
            if (isValidationError(err)) throw httpError(400, err.message)
            throw err
        }
    }
}
