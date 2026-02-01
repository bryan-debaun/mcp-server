import { Controller, Get, Query, Route, Tags, Response, SuccessResponse, Path } from 'tsoa';

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
}
