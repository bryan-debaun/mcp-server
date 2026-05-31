import { Controller, Get, Post, Put, Delete, Path, Body, Route, Tags, Response, SuccessResponse, Security, Query } from 'tsoa';
import { callTool } from '../../tools/local.js';
import { isNotFound, httpError } from './_http-errors.js';

export interface Movie {
    id: number;
    title: string;
    status: string;
    description?: string;
    iasn?: string;
    imdbId?: string;
    releasedAt?: string;
    createdAt: string;
    updatedAt: string;

    // Embedded rating fields
    rating?: number | null;
    review?: string | null;
    ratedAt?: string | null;
}

export interface ListMoviesResponse {
    movies: Movie[];
    total: number;
}

export interface CreateMovieRequest {
    title: string;
    description?: string;
    iasn?: string;
    imdbId?: string;
    releasedAt?: string;
    status?: string;
}

export interface UpdateMovieRequest {
    id: number;
    title?: string;
    description?: string;
    iasn?: string;
    imdbId?: string;
    releasedAt?: string;
    status?: string;
}

@Route('api/movies')
@Tags('Movies')
export class MoviesController extends Controller {
    @Get()
    @SuccessResponse('200', 'Movies retrieved successfully')
    public async listMovies(@Query() status?: string, @Query() search?: string, @Query() limit?: number, @Query() offset?: number): Promise<ListMoviesResponse> {
        const result = await callTool('list-movies', { status, search, limit, offset });
        return result as ListMoviesResponse;
    }

    @Get('{id}')
    @SuccessResponse('200', 'Movie retrieved successfully')
    @Response('404', 'Movie not found')
    public async getMovie(@Path() id: number): Promise<Movie> {
        try {
            const result = await callTool('get-movie', { id });
            return result as Movie;
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Movie not found');
            }
            throw err;
        }
    }

    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Movie created successfully')
    public async createMovie(@Body() body: CreateMovieRequest): Promise<Movie> {
        const result = await callTool('create-movie', body);
        this.setStatus(201);
        return result as Movie;
    }

    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Movie updated successfully')
    @Response('404', 'Movie not found')
    public async updateMovie(@Path() id: number, @Body() body: UpdateMovieRequest): Promise<Movie> {
        try {
            const result = await callTool('update-movie', { ...(body as any), id });
            return result as Movie;
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Movie not found');
            }
            throw err;
        }
    }

    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Movie deleted successfully')
    @Response('404', 'Movie not found')
    public async deleteMovie(@Path() id: number): Promise<{ success: boolean }> {
        try {
            await callTool('delete-movie', { id });
            return { success: true };
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Movie not found');
            }
            throw err;
        }
    }
}
