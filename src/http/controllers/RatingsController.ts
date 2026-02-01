import { Controller, Get, Query, Route, Tags, Response, SuccessResponse } from 'tsoa';

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
}
