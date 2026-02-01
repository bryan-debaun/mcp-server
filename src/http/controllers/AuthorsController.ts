import { Controller, Get, Post, Put, Delete, Query, Route, Tags, Response, SuccessResponse, Path, Body, Security, Request } from 'tsoa';
import type { Request as ExpressRequest } from 'express';

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
 * Create author request
 */
export interface CreateAuthorRequest {
    name: string;
    bio?: string;
    website?: string;
}

/**
 * Update author request
 */
export interface UpdateAuthorRequest {
    name?: string;
    bio?: string;
    website?: string;
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

    /**
     * Create a new author (admin only)
     * @summary Create a new author
     * @param request Express request with JWT user info
     * @param body Author data
     */
    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Author created successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    @Response('500', 'Internal server error')
    public async createAuthor(
        @Request() request: ExpressRequest,
        @Body() body: CreateAuthorRequest
    ): Promise<Author> {
        const { callTool } = await import('../../tools/local.js');
        try {
            if (!body.name) {
                this.setStatus(400);
                throw new Error('name is required');
            }

            const createdBy = (request as any).user?.sub ? Number((request as any).user.sub) : undefined;
            const result = await callTool('create-author', {
                ...body,
                createdBy
            });
            this.setStatus(201);
            return result as Author;
        } catch (err: any) {
            console.error('create-author failed', err);
            this.setStatus(500);
            throw new Error('Failed to create author');
        }
    }

    /**
     * Update an author (admin only)
     * @summary Update an existing author
     * @param id Author ID
     * @param body Updated author data
     */
    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Author updated successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    @Response('404', 'Author not found')
    @Response('500', 'Internal server error')
    public async updateAuthor(
        @Path() id: number,
        @Body() body: UpdateAuthorRequest
    ): Promise<Author> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('update-author', {
                id,
                ...body
            });
            return result as Author;
        } catch (err: any) {
            console.error('update-author failed', err);
            if (err.message?.includes('not found')) {
                this.setStatus(404);
                throw new Error('Author not found');
            }
            this.setStatus(500);
            throw new Error('Failed to update author');
        }
    }

    /**
     * Delete an author (admin only)
     * @summary Delete an author by ID
     * @param id Author ID
     */
    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Author deleted successfully')
    @Response('400', 'Invalid author ID')
    @Response('401', 'Unauthorized')
    @Response('404', 'Author not found')
    @Response('500', 'Internal server error')
    public async deleteAuthor(@Path() id: number): Promise<{ success: boolean }> {
        const { callTool } = await import('../../tools/local.js');
        try {
            await callTool('delete-author', { id });
            return { success: true };
        } catch (err: any) {
            console.error('delete-author failed', err);
            if (err.message?.includes('not found')) {
                this.setStatus(404);
                throw new Error('Author not found');
            }
            this.setStatus(500);
            throw new Error('Failed to delete author');
        }
    }
}
