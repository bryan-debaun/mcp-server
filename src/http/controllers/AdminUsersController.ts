import { Controller, Patch, Delete, Route, Tags, Body, Path, Security, SuccessResponse, Response, Request } from 'tsoa'
import type { Request as ExpressRequest } from 'express'

export interface AdminUser {
    id: number
    email: string
    name?: string | null
    role?: string | null
    blocked?: boolean
    isAdmin?: boolean
}

export interface UpdateAdminUserRequest {
    role?: string
    blocked?: boolean
}

@Route('api/admin/users')
@Tags('Admin')
export class AdminUsersController extends Controller {
    /**
     * Update a user's role or blocked state (admin only)
     */
    @Patch('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'User updated successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    @Response('403', 'Forbidden')
    @Response('404', 'User not found')
    public async patchUser(
        @Request() request: ExpressRequest,
        @Path() id: number,
        @Body() body: UpdateAdminUserRequest
    ): Promise<AdminUser> {
        const actorId = (request as any).user?.sub ? Number((request as any).user.sub) : undefined
        const { setUserRole, setUserBlocked } = await import('../../services/admin-service.js')
        let user: any = null
        try {
            if (body.role !== undefined) user = await setUserRole(id, body.role, actorId)
            if (body.blocked !== undefined) user = await setUserBlocked(id, !!body.blocked, actorId)
            return user as AdminUser
        } catch (err: any) {
            console.error('patch-user failed', err)
            if (err.message?.includes('not found') || err.message?.includes('user not found')) {
                this.setStatus(404)
                throw new Error('User not found')
            }
            this.setStatus(500)
            throw new Error('Failed to update user')
        }
    }

    /**
     * Delete a user (soft-delete by default). Use ?hard=1 to attempt hard delete.
     */
    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'User deleted successfully')
    @Response('401', 'Unauthorized')
    @Response('403', 'Forbidden')
    @Response('404', 'User not found')
    public async deleteUser(
        @Request() request: ExpressRequest,
        @Path() id: number,
        // TSOA doesn't support query boolean types well in decorators here; parse in body/query elsewhere. We'll accept as query param in runtime via request.
    ): Promise<{ success: boolean }> {
        const actorId = (request as any).user?.sub ? Number((request as any).user.sub) : undefined
        const hard = ((request.query?.hard as any) === '1' || (request.query?.hard as any) === 'true')
        const { deleteUser } = await import('../../services/admin-service.js')
        try {
            await deleteUser(id, actorId, { hard })
            return { success: true }
        } catch (err: any) {
            console.error('delete-user failed', err)
            if (err.message?.includes('not found')) {
                this.setStatus(404)
                throw new Error('User not found')
            }
            this.setStatus(500)
            throw new Error('Failed to delete user')
        }
    }
}
