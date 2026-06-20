import {
    Body,
    Controller,
    Delete,
    Get,
    Path,
    Post,
    Put,
    Query,
    Response,
    Route,
    Security,
    SuccessResponse,
    Tags,
} from 'tsoa'
import { callTool } from '../../tools/local.js'
import { httpError, isNotFound } from './_http-errors.js'

export interface VideoGame {
    id: number
    title: string
    status: string
    description?: string
    platform: string
    igdbId?: string
    releasedAt?: string
    createdAt: string
    updatedAt: string

    // Embedded rating fields
    rating?: number | null
    review?: string | null
    ratedAt?: string | null
}

export interface ListVideoGamesResponse {
    videoGames: VideoGame[]
    total: number
}

export interface CreateVideoGameRequest {
    title: string
    platform: string
    description?: string
    igdbId?: string
    releasedAt?: string
    status?: string
}

export interface UpdateVideoGameRequest {
    id: number
    title?: string
    platform?: string
    description?: string
    igdbId?: string
    releasedAt?: string
    status?: string
}

@Route('api/videogames')
@Tags('VideoGames')
export class VideoGamesController extends Controller {
    @Get()
    @Security('api_key')
    @SuccessResponse('200', 'Video games retrieved successfully')
    public async listVideoGames(
        @Query() platform?: string,
        @Query() search?: string,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ListVideoGamesResponse> {
        const result = await callTool('list-videogames', {
            platform,
            search,
            limit,
            offset,
        })
        return result as ListVideoGamesResponse
    }

    @Get('{id}')
    @Security('api_key')
    @SuccessResponse('200', 'Video game retrieved successfully')
    @Response('404', 'Video game not found')
    public async getVideoGame(@Path() id: number): Promise<VideoGame> {
        try {
            const result = await callTool('get-videogame', { id })
            return result as VideoGame
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Video game not found')
            }
            throw err
        }
    }

    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Video game created successfully')
    public async createVideoGame(
        @Body() body: CreateVideoGameRequest,
    ): Promise<VideoGame> {
        const result = await callTool('create-videogame', body)
        this.setStatus(201)
        return result as VideoGame
    }

    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Video game updated successfully')
    @Response('404', 'Video game not found')
    public async updateVideoGame(
        @Path() id: number,
        @Body() body: UpdateVideoGameRequest,
    ): Promise<VideoGame> {
        try {
            const result = await callTool('update-videogame', {
                ...(body as any),
                id,
            })
            return result as VideoGame
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Video game not found')
            }
            throw err
        }
    }

    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Video game deleted successfully')
    @Response('404', 'Video game not found')
    public async deleteVideoGame(
        @Path() id: number,
    ): Promise<{ success: boolean }> {
        try {
            await callTool('delete-videogame', { id })
            return { success: true }
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Video game not found')
            }
            throw err
        }
    }
}
