import { Controller, Get, Post, Put, Delete, Query, Route, Tags, Response, SuccessResponse, Path, Body, Security, Request } from 'tsoa';
import type { Request as ExpressRequest } from 'express';

/**
 * Book representation
 */
export interface Book {
    id: number;
    title: string;
    description?: string;
    isbn?: string;
    publishedAt?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Book with author information
 */
export interface BookWithAuthors extends Book {
    authors?: Array<{
        id: number;
        name: string;
    }>;
}

/**
 * List books response
 */
export interface ListBooksResponse {
    books: BookWithAuthors[];
    total: number;
}

/**
 * Create book request
 */
export interface CreateBookRequest {
    title: string;
    status?: string;
    description?: string;
    isbn?: string;
    publishedAt?: string;
    authorIds?: number[];
}

/**
 * Update book request
 */
export interface UpdateBookRequest {
    title?: string;
    status?: string;
    description?: string;
    isbn?: string;
    publishedAt?: string;
    authorIds?: number[];
}

/**
 * Controller for book-related operations
 */
@Route('api/books')
@Tags('Books')
export class BooksController extends Controller {
    /**
     * List books with optional filtering
     * @summary Get a list of books
     * @param authorId Filter by author ID
     * @param minRating Minimum average rating (1-10)
     * @param search Search in title and description
     * @param limit Maximum number of results (default 50)
     * @param offset Number of results to skip (default 0)
     */
    @Get()
    @SuccessResponse('200', 'Books retrieved successfully')
    @Response('500', 'Internal server error')
    public async listBooks(
        @Query() authorId?: number,
        @Query() minRating?: number,
        @Query() search?: string,
        @Query() status?: string,
        @Query() limit?: number,
        @Query() offset?: number
    ): Promise<ListBooksResponse> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('list-books', {
                authorId,
                minRating,
                search,
                limit,
                offset
            });
            return result as ListBooksResponse;
        } catch (err: any) {
            console.error('list-books failed', err);
            // Gracefully degrade: return empty list if database is unavailable
            return { books: [], total: 0 };
        }
    }

    /**
     * Get a book by ID
     * @summary Get book details by ID
     * @param id Book ID
     */
    @Get('{id}')
    @SuccessResponse('200', 'Book retrieved successfully')
    @Response('404', 'Book not found')
    @Response('400', 'Invalid book ID')
    public async getBook(@Path() id: number): Promise<BookWithAuthors> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('get-book', { id });
            return result as BookWithAuthors;
        } catch (err: any) {
            console.error('get-book failed', err);
            this.setStatus(404);
            throw new Error('Book not found');
        }
    }

    /**
     * Create a new book (admin only)
     * @summary Create a new book
     * @param request Express request with JWT user info
     * @param body Book data
     */
    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Book created successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    @Response('500', 'Internal server error')
    public async createBook(
        @Request() request: ExpressRequest,
        @Body() body: CreateBookRequest
    ): Promise<Book> {
        const { callTool } = await import('../../tools/local.js');
        try {
            if (!body.title) {
                this.setStatus(400);
                throw new Error('title is required');
            }

            const createdBy = (request as any).user?.sub ? Number((request as any).user.sub) : undefined;
            const result = await callTool('create-book', {
                ...body,
                createdBy
            });
            this.setStatus(201);
            return result as Book;
        } catch (err: any) {
            console.error('create-book failed', err);
            if (err.message?.includes('Unique constraint') || err.message?.includes('already exists')) {
                this.setStatus(400);
                throw new Error('ISBN already exists');
            }
            this.setStatus(500);
            throw new Error('Failed to create book');
        }
    }

    /**
     * Update a book (admin only)
     * @summary Update an existing book
     * @param id Book ID
     * @param body Updated book data
     */
    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Book updated successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    @Response('404', 'Book not found')
    @Response('500', 'Internal server error')
    public async updateBook(
        @Path() id: number,
        @Body() body: UpdateBookRequest
    ): Promise<Book> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('update-book', {
                id,
                ...body
            });
            return result as Book;
        } catch (err: any) {
            console.error('update-book failed', err);
            if (err.message?.includes('not found')) {
                this.setStatus(404);
                throw new Error('Book not found');
            }
            if (err.message?.includes('Unique constraint') || err.message?.includes('already exists')) {
                this.setStatus(400);
                throw new Error('ISBN already exists');
            }
            this.setStatus(500);
            throw new Error('Failed to update book');
        }
    }

    /**
     * Delete a book (admin only)
     * @summary Delete a book by ID
     * @param id Book ID
     */
    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Book deleted successfully')
    @Response('400', 'Invalid book ID')
    @Response('401', 'Unauthorized')
    @Response('404', 'Book not found')
    @Response('500', 'Internal server error')
    public async deleteBook(@Path() id: number): Promise<{ success: boolean }> {
        const { callTool } = await import('../../tools/local.js');
        try {
            await callTool('delete-book', { id });
            return { success: true };
        } catch (err: any) {
            console.error('delete-book failed', err);
            if (err.message?.includes('not found')) {
                this.setStatus(404);
                throw new Error('Book not found');
            }
            this.setStatus(500);
            throw new Error('Failed to delete book');
        }
    }
}
