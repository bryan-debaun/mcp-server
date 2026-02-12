import { Controller, Get, Post, Put, Delete, Path, Body, Route, Tags, Response, SuccessResponse, Security, Query } from 'tsoa';

export interface ContentCreator {
    id: number;
    name: string;
    description?: string;
    website?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListContentCreatorsResponse {
    creators: ContentCreator[];
    total: number;
}

export interface CreateContentCreatorRequest {
    name: string;
    description?: string;
    website?: string;
}

export interface UpdateContentCreatorRequest {
    id: number;
    name?: string;
    description?: string;
    website?: string;
}

@Route('api/content-creators')
@Tags('ContentCreators')
export class ContentCreatorsController extends Controller {
    @Get()
    @SuccessResponse('200', 'Content creators retrieved successfully')
    public async listContentCreators(@Query() search?: string, @Query() limit?: number, @Query() offset?: number): Promise<ListContentCreatorsResponse> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('list-content-creators', { search, limit, offset });
            return result as ListContentCreatorsResponse;
        } catch (err: any) {
            console.error('list-content-creators failed', err);
            return { creators: [], total: 0 };
        }
    }

    @Get('{id}')
    @SuccessResponse('200', 'Content creator retrieved successfully')
    @Response('404', 'Content creator not found')
    public async getContentCreator(@Path() id: number): Promise<ContentCreator> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('get-content-creator', { id });
            return result as ContentCreator;
        } catch (err: any) {
            console.error('get-content-creator failed', err);
            throw new Error('Content creator not found');
        }
    }

    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Content creator created successfully')
    public async createContentCreator(@Body() body: CreateContentCreatorRequest): Promise<ContentCreator> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const result = await callTool('create-content-creator', body);
            this.setStatus(201);
            return result as ContentCreator;
        } catch (err: any) {
            console.error('create-content-creator failed', err);
            this.setStatus(500);
            throw new Error('Failed to create content creator');
        }
    }

    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Content creator updated successfully')
    @Response('404', 'Content creator not found')
    public async updateContentCreator(@Path() id: number, @Body() body: UpdateContentCreatorRequest): Promise<ContentCreator> {
        const { callTool } = await import('../../tools/local.js');
        try {
            const payload = { ...(body as any), id };
            const result = await callTool('update-content-creator', payload);
            return result as ContentCreator;
        } catch (err: any) {
            console.error('update-content-creator failed', err);
            throw new Error('Content creator not found');
        }
    }

    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Content creator deleted successfully')
    public async deleteContentCreator(@Path() id: number): Promise<{ success: boolean }> {
        const { callTool } = await import('../../tools/local.js');
        try {
            await callTool('delete-content-creator', { id });
            return { success: true };
        } catch (err: any) {
            console.error('delete-content-creator failed', err);
            this.setStatus(500);
            throw new Error('Failed to delete content creator');
        }
    }
}
