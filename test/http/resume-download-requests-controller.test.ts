import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the tool layer so we can assert the controller's identity-injection and
// error-mapping logic in isolation (no DB, no JWKS).
vi.mock('../../src/tools/local.js', () => ({ callTool: vi.fn() }))

import { ResumeDownloadRequestsController } from '../../src/http/controllers/ResumeDownloadRequestsController'
import { callTool } from '../../src/tools/local.js'

const mockCallTool = callTool as unknown as ReturnType<typeof vi.fn>

// expressAuthentication attaches the verified JWT to request.user.
const reqAs = (user: any) => ({ headers: {}, user }) as any

describe('ResumeDownloadRequestsController — create (#139)', () => {
    beforeEach(() => {
        mockCallTool.mockReset()
        mockCallTool.mockResolvedValue({ id: 'r1', status: 'pending' })
    })

    it('injects userId/userEmail from the JWT, not the body', async () => {
        await new ResumeDownloadRequestsController().createRequest(
            reqAs({ sub: 'user-123', email: 'a@b.com' }),
            { reason: 'applying' },
        )
        expect(mockCallTool).toHaveBeenCalledWith(
            'create-resume-download-request',
            { userId: 'user-123', userEmail: 'a@b.com', reason: 'applying' },
        )
    })

    it('maps a quota error to 429', async () => {
        mockCallTool.mockRejectedValueOnce(
            new Error('Quota exceeded: at most 3 per 30 days'),
        )
        await expect(
            new ResumeDownloadRequestsController().createRequest(
                reqAs({ sub: 'user-123', email: 'a@b.com' }),
                {},
            ),
        ).rejects.toMatchObject({ status: 429 })
    })

    it('401s when the token has no subject', async () => {
        await expect(
            new ResumeDownloadRequestsController().createRequest(
                reqAs({ email: 'a@b.com' }),
                {},
            ),
        ).rejects.toMatchObject({ status: 401 })
    })

    it('400s when the token has no email', async () => {
        await expect(
            new ResumeDownloadRequestsController().createRequest(
                reqAs({ sub: 'user-123' }),
                {},
            ),
        ).rejects.toMatchObject({ status: 400 })
    })
})

describe('ResumeDownloadRequestsController — admin actions', () => {
    beforeEach(() => {
        mockCallTool.mockReset()
    })

    it('passes list filters through to the tool', async () => {
        mockCallTool.mockResolvedValueOnce({
            requests: [],
            total: 0,
            limit: 50,
            offset: 0,
        })
        await new ResumeDownloadRequestsController().listRequests(
            'pending',
            'u1',
            10,
            5,
        )
        expect(mockCallTool).toHaveBeenCalledWith(
            'list-resume-download-requests',
            { status: 'pending', userId: 'u1', limit: 10, offset: 5 },
        )
    })

    it('approve maps not-found to 404', async () => {
        mockCallTool.mockRejectedValueOnce(
            new Error('Resume download request not found'),
        )
        await expect(
            new ResumeDownloadRequestsController().approveRequest('nope', {}),
        ).rejects.toMatchObject({ status: 404 })
    })

    it('approve maps an invalid-state error to 409', async () => {
        mockCallTool.mockRejectedValueOnce(
            new Error('Cannot approve a request that is denied'),
        )
        await expect(
            new ResumeDownloadRequestsController().approveRequest('r1', {}),
        ).rejects.toMatchObject({ status: 409 })
    })
})

describe('ResumeDownloadRequestsController — record-download (#145)', () => {
    beforeEach(() => {
        mockCallTool.mockReset()
    })

    it('delegates to the record-resume-download tool by id', async () => {
        mockCallTool.mockResolvedValueOnce({
            id: 'r1',
            status: 'approved',
            downloadCount: 1,
        })
        const res = await new ResumeDownloadRequestsController().recordDownload(
            'r1',
        )
        expect(res).toMatchObject({ downloadCount: 1 })
        expect(mockCallTool).toHaveBeenCalledWith('record-resume-download', {
            id: 'r1',
        })
    })

    it('maps a cap-reached error to 409', async () => {
        mockCallTool.mockRejectedValueOnce(new Error('Download cap reached'))
        await expect(
            new ResumeDownloadRequestsController().recordDownload('r1'),
        ).rejects.toMatchObject({ status: 409 })
    })

    it('maps an expired-window error to 410', async () => {
        mockCallTool.mockRejectedValueOnce(
            new Error('Download window has expired'),
        )
        await expect(
            new ResumeDownloadRequestsController().recordDownload('r1'),
        ).rejects.toMatchObject({ status: 410 })
    })

    it('maps a not-found error to 404', async () => {
        mockCallTool.mockRejectedValueOnce(
            new Error('Resume download request not found'),
        )
        await expect(
            new ResumeDownloadRequestsController().recordDownload('nope'),
        ).rejects.toMatchObject({ status: 404 })
    })
})
