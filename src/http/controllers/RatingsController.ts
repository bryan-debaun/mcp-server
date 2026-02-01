import { Controller, Get, Post, Delete, Query, Route, Tags, Response, SuccessResponse, Path, Body, Security, Request } from 'tsoa';
import type { Request as ExpressRequest } from 'express';

/**
 * Rating representation
 */
export interface Rating {
    id: number;
    bookId: number;
    userId: number;
    rating: number;
    review?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Rating with book and user details
 */
export interface RatingWithDetails extends Rating {
    book?: {
        id: number;
        title: string;
    };
    user?: {
        id: number;
        email: string;
    };
}

/**
 * List ratings response
 */
export interface ListRatingsResponse {
    ratings: RatingWithDetails[];
    total: number;
}

/**
 * Create or update rating request
 */
export interface CreateRatingRequest {
    bookId: number;
    rating: number;
    review?: string;
}

/**
 * Controller for rating-related operations
 */
@Route('api/ratings')
@Tags('Ratings')
export class RatingsController extends Controller {
    /**
     * List ratings with optional filtering
     * @summary Get a list of ratings
     * @param bookId Filter by book ID
     * @param userId Filter by user ID
     * @param minRating Minimum rating value (1-10)
     * @param limit Maximum number of results (default 50)
     * @param offset Number of results to skip (default 0)
     */
    @Get()
    @SuccessResponse('200', 'Ratings retrieved successfully')
    @Response('500', 'Internal server error')
    public async listRatings(
        @Query() bookId?: number,
        @Query() userId?: number,
        @Query() minRating?: number,
        @Query() limit?: number,
        @Query() offset?: number
    ): Promise<ListRatingsResponse> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('list-ratings', {
                bookId,
                userId,
                minRating,
                limit,
                offset
            });
            return result as ListRatingsResponse;
        } catch (err: any) {
            console.error('list-ratings failed', err);
            // Gracefully degrade: return empty list if database is unavailable
            return { ratings: [], total: 0 };
        }
    }

    /**
     * Create or update a rating (authenticated users)
     * @summary Create or update a rating for a book
     * @param request Express request with JWT user info
     * @param body Rating data
     */
    @Post()
    @Security('jwt')
    @SuccessResponse('201', 'Rating created successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    @Response('404', 'Book not found')
    @Response('500', 'Internal server error')
    public async createRating(
        @Request() request: ExpressRequest,
        @Body() body: CreateRatingRequest
    ): Promise<Rating> {
        const { callTool } = await import('../../tools/local.js');
        try {
            if (!body.bookId || !body.rating) {
                this.setStatus(400);
                throw new Error('bookId and rating are required');
            }
            if (body.rating < 1 || body.rating > 10) {
                this.setStatus(400);
                throw new Error('rating must be between 1 and 10');
            }

            const userId = (request as any).user?.sub ? Number((request as any).user.sub) : undefined;
            if (!userId) {
                this.setStatus(401);
                throw new Error('Unauthorized');
            }

            const result = await callTool('create-or-update-rating', {
                bookId: Number(body.bookId),
                userId,
                rating: Number(body.rating),
                review: body.review
            });
            this.setStatus(201);
            return result as Rating;
        } catch (err: any) {
            console.error('create-or-update-rating failed', err);
            if (err.message?.includes('not found')) {
                this.setStatus(404);
                throw new Error('Book not found');
            }
            if (err.message?.includes('required') || err.message?.includes('between')) {
                throw err; // Already has status set
            }
            this.setStatus(500);
            throw new Error('Failed to create or update rating');
        }
    }

    /**
     * Delete a rating (owner or admin only)
     * @summary Delete a rating by ID
     * @param request Express request with JWT user info
     * @param id Rating ID
     */
    @Delete('{id}')
    @Security('jwt')
    @SuccessResponse('200', 'Rating deleted successfully')
    @Response('400', 'Invalid rating ID')
    @Response('401', 'Unauthorized')
    @Response('403', 'Forbidden')
    @Response('404', 'Rating not found')
    @Response('500', 'Internal server error')
    public async deleteRating(
        @Request() request: ExpressRequest,
        @Path() id: number
    ): Promise<{ success: boolean }> {
        const { callTool } = await import('../../tools/local.js');
        const { prisma } = await import('../../db/index.js');
        try {
            const userId = (request as any).user?.sub ? Number((request as any).user.sub) : undefined;
            const userRole = (request as any).user?.role;

            if (!userId) {
                this.setStatus(401);
                throw new Error('Unauthorized');
            }

            // Check ownership or admin role
            const rating = await prisma.rating.findUnique({ where: { id } });
            if (!rating) {
                this.setStatus(404);
                throw new Error('Rating not found');
            }

            if (rating.userId !== userId && userRole !== 'admin') {
                this.setStatus(403);
                throw new Error('Forbidden: You can only delete your own ratings');
            }

            await callTool('delete-rating', { id });
            return { success: true };
        } catch (err: any) {
            console.error('delete-rating failed', err);
            if (err.message?.includes('not found')) {
                throw err; // Already has status set
            }
            if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
                throw err; // Already has status set
            }
            this.setStatus(500);
            throw new Error('Failed to delete rating');
        }
    }
}
