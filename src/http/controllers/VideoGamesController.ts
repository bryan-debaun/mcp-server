import { Controller, Get, Post, Put, Delete, Path, Body, Route, Tags, Response, SuccessResponse, Security, Query } from 'tsoa';

export interface VideoGame {
    id: number;
    title: string;
    status: string;
    description?: string;
    platform: string;
    igdbId?: string;
    releasedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListVideoGamesResponse {
    videoGames: VideoGame[];
    total: number;
}

export interface CreateVideoGameRequest {
    title: string;
    platform: string;
    description?: string;
    igdbId?: string;
    releasedAt?: string;
    status?: string;
}

export interface UpdateVideoGameRequest {
    id: number;
    title?: string;
    platform?: string;
    description?: string;
    igdbId?: string;
    releasedAt?: string;
    status?: string;
}

@Route('api/videogames')
@Tags('VideoGames')
export class VideoGamesController extends Controller {
    @Get()
    @SuccessResponse('200', 'Video games retrieved successfully')
    public async listVideoGames(@Query() platform?: string, @Query() search?: string, @Query() limit?: number, @Query() offset?: number): Promise<ListVideoGamesResponse> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('list-videogames', { platform, search, limit, offset });
            return result as ListVideoGamesResponse;
        } catch (err: any) {
            console.error('list-videogames failed', err);
            return { videoGames: [], total: 0 };
        }
    }

    @Get('{id}')
    @SuccessResponse('200', 'Video game retrieved successfully')
    @Response('404', 'Video game not found')
    public async getVideoGame(@Path() id: number): Promise<VideoGame> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('get-videogame', { id });
            return result as VideoGame;
        } catch (err: any) {
            console.error('get-videogame failed', err);
            throw new Error('Video game not found');
        }
    }

    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Video game created successfully')
    public async createVideoGame(@Body() body: CreateVideoGameRequest): Promise<VideoGame> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('create-videogame', body);
            this.setStatus(201);
            return result as VideoGame;
        } catch (err: any) {
            console.error('create-videogame failed', err);
            this.setStatus(500);
            throw new Error('Failed to create video game');
        }
    }

    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Video game updated successfully')
    @Response('404', 'Video game not found')
    public async updateVideoGame(@Path() id: number, @Body() body: UpdateVideoGameRequest): Promise<VideoGame> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const payload = { ...(body as any), id };
            const result = await callTool('update-videogame', payload);
            return result as VideoGame;
        } catch (err: any) {
            console.error('update-videogame failed', err);
            throw new Error('Video game not found');
        }
    }

    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Video game deleted successfully')
    public async deleteVideoGame(@Path() id: number): Promise<{ success: boolean }> {
        const { callTool } = await import('../../tools/local.js');
        try {
            await callTool('delete-videogame', { id });
            return { success: true };
        } catch (err: any) {
            console.error('delete-videogame failed', err);
            this.setStatus(500);
            throw new Error('Failed to delete video game');
        }
    }
}
