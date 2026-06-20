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

export interface ContentCreator {
    id: number
    name: string
    description?: string
    website?: string
    createdAt: string
    updatedAt: string
}

export interface ListContentCreatorsResponse {
    creators: ContentCreator[]
    total: number
}

export interface CreateContentCreatorRequest {
    name: string
    description?: string
    website?: string
}

export interface UpdateContentCreatorRequest {
    id: number
    name?: string
    description?: string
    website?: string
}

@Route('api/content-creators')
@Tags('ContentCreators')
export class ContentCreatorsController extends Controller {
    @Get()
    @Security('api_key')
    @SuccessResponse('200', 'Content creators retrieved successfully')
    public async listContentCreators(
        @Query() search?: string,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ListContentCreatorsResponse> {
        const result = await callTool('list-content-creators', {
            search,
            limit,
            offset,
        })
        return result as ListContentCreatorsResponse
    }

    @Get('{id}')
    @Security('api_key')
    @SuccessResponse('200', 'Content creator retrieved successfully')
    @Response('404', 'Content creator not found')
    public async getContentCreator(
        @Path() id: number,
    ): Promise<ContentCreator> {
        try {
            const result = await callTool('get-content-creator', { id })
            return result as ContentCreator
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Content creator not found')
            }
            throw err
        }
    }

    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Content creator created successfully')
    public async createContentCreator(
        @Body() body: CreateContentCreatorRequest,
    ): Promise<ContentCreator> {
        const result = await callTool('create-content-creator', body)
        this.setStatus(201)
        return result as ContentCreator
    }

    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Content creator updated successfully')
    @Response('404', 'Content creator not found')
    public async updateContentCreator(
        @Path() id: number,
        @Body() body: UpdateContentCreatorRequest,
    ): Promise<ContentCreator> {
        try {
            const result = await callTool('update-content-creator', {
                ...(body as any),
                id,
            })
            return result as ContentCreator
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Content creator not found')
            }
            throw err
        }
    }

    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Content creator deleted successfully')
    @Response('404', 'Content creator not found')
    public async deleteContentCreator(
        @Path() id: number,
    ): Promise<{ success: boolean }> {
        try {
            await callTool('delete-content-creator', { id })
            return { success: true }
        } catch (err: any) {
            if (isNotFound(err)) {
                throw httpError(404, 'Content creator not found')
            }
            throw err
        }
    }
}
