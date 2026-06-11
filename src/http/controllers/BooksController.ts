import type { Request as ExpressRequest } from 'express'
import {
    Body,
    Controller,
    Delete,
    Get,
    Path,
    Post,
    Put,
    Query,
    Request,
    Response,
    Route,
    Security,
    SuccessResponse,
    Tags,
} from 'tsoa'
import type { ItemStatus } from '../../tools/db/books/status'
import { callTool } from '../../tools/local.js'
import { httpError, isNotFound, isUniqueViolation } from './_http-errors.js'

/**
 * Book representation - force TSOA refresh
 */
export interface Book {
    id: number
    title: string
    description?: string
    isbn?: string
    publishedAt?: string
    status: ItemStatus
    createdAt: string
    updatedAt: string

    // Embedded rating fields
    rating?: number | null
    review?: string | null
    ratedAt?: string | null
}

/**
 * Book with author information
 */
export interface BookWithAuthors extends Book {
    authors?: Array<{
        id: number
        name: string
    }>
}

/**
 * List books response
 */
export interface ListBooksResponse {
    books: BookWithAuthors[]
    total: number
}

/**
 * Create book request
 */
export interface CreateBookRequest {
    title: string
    status?: ItemStatus
    description?: string
    isbn?: string
    publishedAt?: string
    authorIds?: number[]
}

/**
 * Update book request
 */
export interface UpdateBookRequest {
    title?: string
    status?: ItemStatus
    description?: string
    isbn?: string
    publishedAt?: string
    authorIds?: number[]
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
        @Query() status?: ItemStatus,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ListBooksResponse> {
        // Let failures surface as 5xx via the global error handler — an empty
        // result must mean "no books", never "the database is down".
        const result = await callTool('list-books', {
            authorId,
            minRating,
            search,
            status,
            limit,
            offset,
        })
        return result as ListBooksResponse
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
        try {
            const result = await callTool('get-book', { id })
            return result as BookWithAuthors
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Book not found')
            throw err
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
        @Body() body: CreateBookRequest,
    ): Promise<Book> {
        if (!body.title) throw httpError(400, 'title is required')

        try {
            const createdBy = (request as any).user?.sub
                ? Number((request as any).user.sub)
                : undefined
            const result = await callTool('create-book', { ...body, createdBy })
            this.setStatus(201)
            return result as Book
        } catch (err: any) {
            if (isUniqueViolation(err))
                throw httpError(400, 'ISBN already exists')
            throw err
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
        @Body() body: UpdateBookRequest,
    ): Promise<Book> {
        try {
            const result = await callTool('update-book', { id, ...body })
            return result as Book
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Book not found')
            if (isUniqueViolation(err))
                throw httpError(400, 'ISBN already exists')
            throw err
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
        try {
            await callTool('delete-book', { id })
            return { success: true }
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Book not found')
            throw err
        }
    }
}
