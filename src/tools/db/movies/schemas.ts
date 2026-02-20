// Input schemas for movie-related MCP tools

export const CreateMovieInputSchema = {
    type: "object",
    properties: {
        title: { type: "string", description: "Movie title" },
        status: { type: "string", description: "Movie status (e.g., Not started, In progress, Completed)", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        description: { type: "string", description: "Movie description" },
        iasn: { type: "string", description: "IASN (optional, must be unique)" },
        imdbId: { type: "string", description: "IMDB ID (optional, must be unique)" },
        releasedAt: { type: "string", description: "Release date (ISO 8601 format)" },
    },
    required: ["title"],
} as const;

export const UpdateMovieInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Movie ID" },
        title: { type: "string", description: "Movie title" },
        status: { type: "string", description: "Movie status (e.g., Not started, In progress, Completed)", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        description: { type: "string", description: "Movie description" },
        iasn: { type: "string", description: "IASN (must be unique)" },
        imdbId: { type: "string", description: "IMDB ID (must be unique)" },
        releasedAt: { type: "string", description: "Release date (ISO 8601 format)" },
    },
    required: ["id"],
} as const;

export const DeleteMovieInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Movie ID to delete" },
    },
    required: ["id"],
} as const;

export const GetMovieInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Movie ID to retrieve" },
    },
    required: ["id"],
} as const;

export const ListMoviesInputSchema = {
    type: "object",
    properties: {
        minRating: { type: "number", description: "Minimum average rating (1-10)" },
        search: { type: "string", description: "Search in title and description" },
        status: { type: "string", description: "Filter by status", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        limit: { type: "number", description: "Maximum number of results (default 50)" },
        offset: { type: "number", description: "Number of results to skip (default 0)" },
    },
    required: [],
} as const;
