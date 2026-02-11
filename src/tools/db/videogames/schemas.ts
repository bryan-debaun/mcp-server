// Input schemas for video game-related MCP tools

export const CreateVideoGameInputSchema = {
    type: "object",
    properties: {
        title: { type: "string", description: "Video game title" },
        status: { type: "string", description: "Status", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        description: { type: "string", description: "Game description" },
        platform: { type: "string", description: "Platform (PlayStation, Xbox, PC)", enum: ['PlayStation', 'Xbox', 'PC'] },
        igdbId: { type: "string", description: "IGDB ID (optional, unique)" },
        releasedAt: { type: "string", description: "Release date (ISO 8601)" },
        createdBy: { type: "number", description: "User ID of creator (optional)" },
    },
    required: ["title", "platform"],
} as const;

export const UpdateVideoGameInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Video game ID" },
        title: { type: "string", description: "Video game title" },
        status: { type: "string", description: "Status", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        description: { type: "string", description: "Game description" },
        platform: { type: "string", description: "Platform (PlayStation, Xbox, PC)", enum: ['PlayStation', 'Xbox', 'PC'] },
        igdbId: { type: "string", description: "IGDB ID (optional, unique)" },
        releasedAt: { type: "string", description: "Release date (ISO 8601)" },
    },
    required: ["id"],
} as const;

export const DeleteVideoGameInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Video game ID to delete" },
    },
    required: ["id"],
} as const;

export const GetVideoGameInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Video game ID to retrieve" },
    },
    required: ["id"],
} as const;

export const ListVideoGamesInputSchema = {
    type: "object",
    properties: {
        platform: { type: "string", description: "Filter by platform", enum: ['PlayStation', 'Xbox', 'PC'] },
        minRating: { type: "number", description: "Minimum average rating (1-10)" },
        search: { type: "string", description: "Search in title and description" },
        limit: { type: "number", description: "Maximum number of results (default 50)" },
        offset: { type: "number", description: "Number of results to skip (default 0)" },
    },
    required: [],
} as const;