import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the tool layer so we can assert the controller's delegation and error
// mapping in isolation (no DB, no JWKS).
vi.mock('../../src/tools/local.js', () => ({ callTool: vi.fn() }))

import { ResumeController } from '../../src/http/controllers/ResumeController'
import { callTool } from '../../src/tools/local.js'

const mockCallTool = callTool as unknown as ReturnType<typeof vi.fn>

describe('ResumeController (#147)', () => {
    beforeEach(() => {
        mockCallTool.mockReset()
        mockCallTool.mockResolvedValue({
            document: { basics: { name: 'B' } },
            updatedAt: '2026-07-03T00:00:00Z',
        })
    })

    it('public GET requests the stripped document', async () => {
        await new ResumeController().getResume()
        expect(mockCallTool).toHaveBeenCalledWith('get-resume', {
            includePrivate: false,
        })
    })

    it('full GET requests the document including private contact', async () => {
        await new ResumeController().getResumeFull()
        expect(mockCallTool).toHaveBeenCalledWith('get-resume', {
            includePrivate: true,
        })
    })

    it('GET maps not-found to 404', async () => {
        mockCallTool.mockRejectedValueOnce(new Error('Resume not found'))
        await expect(new ResumeController().getResume()).rejects.toMatchObject({
            status: 404,
        })
    })

    it('PUT delegates the body to update-resume', async () => {
        const body: any = {
            basics: { name: 'Bryan' },
            work: [],
        }
        await new ResumeController().putResume(body)
        expect(mockCallTool).toHaveBeenCalledWith('update-resume', {
            document: body,
        })
    })

    it('PUT maps a validation error to 400', async () => {
        mockCallTool.mockRejectedValueOnce(
            new Error('Invalid resume document: basics.name: Required'),
        )
        await expect(
            new ResumeController().putResume({ basics: {} } as any),
        ).rejects.toMatchObject({ status: 400 })
    })
})
