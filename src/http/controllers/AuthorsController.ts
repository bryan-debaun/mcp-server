import { Controller, Get, Query, Route, Tags, Response, SuccessResponse, Path } from 'tsoa';

/**
 * Author representation
 */
export interface Author {
    id: number;
    name: string;
    bio?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Author with books
 */
export interface AuthorWithBooks extends Author {
    books?: Array<{
        id: number;
        title: string;
    }>;
}

/**
 * List authors response
 */
export interface ListAuthorsResponse {
    authors: AuthorWithBooks[];
    total: number;
}

/**
 * Controller for author-related operations
 */
@Route('api/authors')
@Tags('Authors')
export class AuthorsController extends Controller {
    /**
     * List authors with optional filtering
     * @summary Get a list of authors
     * @param search Search in author name
     * @param limit Maximum number of results (default 50)
     * @param offset Number of results to skip (default 0)
     */
    @Get()
    @SuccessResponse('200', 'Authors retrieved successfully')
    @Response('500', 'Internal server error')
    public async listAuthors(
        @Query() search?: string,
        @Query() limit?: number,
        @Query() offset?: number
    ): Promise<ListAuthorsResponse> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('list-authors', {
                search,
                limit,
                offset
            });
            return result as ListAuthorsResponse;
        } catch (err: any) {
            console.error('list-authors failed', err);
            // Gracefully degrade: return empty list if database is unavailable
            return { authors: [], total: 0 };
        }
    }

    /**
     * Get an author by ID
     * @summary Get author details by ID
     * @param id Author ID
     */
    @Get('{id}')
    @SuccessResponse('200', 'Author retrieved successfully')
    @Response('404', 'Author not found')
    @Response('400', 'Invalid author ID')
    public async getAuthor(@Path() id: number): Promise<AuthorWithBooks> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('get-author', { id });
            return result as AuthorWithBooks;
        } catch (err: any) {
            console.error('get-author failed', err);
            this.setStatus(404);
            throw new Error('Author not found');
        }
    }
}
