// Input schemas for movie-related MCP tools
import { z } from "zod";

const StatusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);

export const CreateMovieInputSchema = {
    title: z.string().describe("Movie title"),
    status: StatusEnum.optional().describe("Movie status (e.g., Not started, In progress, Completed)"),
    description: z.string().optional().describe("Movie description"),
    iasn: z.string().optional().describe("IASN (optional, must be unique)"),
    imdbId: z.string().optional().describe("IMDB ID (optional, must be unique)"),
    releasedAt: z.string().optional().describe("Release date (ISO 8601 format)"),
};

export const UpdateMovieInputSchema = {
    id: z.number().describe("Movie ID"),
    title: z.string().optional().describe("Movie title"),
    status: StatusEnum.optional().describe("Movie status (e.g., Not started, In progress, Completed)"),
    description: z.string().optional().describe("Movie description"),
    iasn: z.string().optional().describe("IASN (must be unique)"),
    imdbId: z.string().optional().describe("IMDB ID (must be unique)"),
    releasedAt: z.string().optional().describe("Release date (ISO 8601 format)"),
};

export const DeleteMovieInputSchema = {
    id: z.number().describe("Movie ID to delete"),
};

export const GetMovieInputSchema = {
    id: z.number().describe("Movie ID to retrieve"),
};

export const ListMoviesInputSchema = {
    minRating: z.number().optional().describe("Minimum average rating (1-10)"),
    search: z.string().optional().describe("Search in title and description"),
    status: StatusEnum.optional().describe("Filter by status"),
    limit: z.number().optional().describe("Maximum number of results (default 50)"),
    offset: z.number().optional().describe("Number of results to skip (default 0)"),
};
