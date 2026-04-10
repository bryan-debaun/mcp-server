// Input schemas for video game-related MCP tools
import { z } from "zod";

const StatusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
const PlatformEnum = z.enum(['PlayStation', 'Xbox', 'PC']);

export const CreateVideoGameInputSchema = {
    title: z.string().describe("Video game title"),
    platform: PlatformEnum.describe("Platform (PlayStation, Xbox, PC)"),
    status: StatusEnum.optional().describe("Status"),
    description: z.string().optional().describe("Game description"),
    igdbId: z.string().optional().describe("IGDB ID (optional, unique)"),
    releasedAt: z.string().optional().describe("Release date (ISO 8601)"),
};

export const UpdateVideoGameInputSchema = {
    id: z.number().describe("Video game ID"),
    title: z.string().optional().describe("Video game title"),
    status: StatusEnum.optional().describe("Status"),
    description: z.string().optional().describe("Game description"),
    platform: PlatformEnum.optional().describe("Platform (PlayStation, Xbox, PC)"),
    igdbId: z.string().optional().describe("IGDB ID (optional, unique)"),
    releasedAt: z.string().optional().describe("Release date (ISO 8601)"),
};

export const DeleteVideoGameInputSchema = {
    id: z.number().describe("Video game ID to delete"),
};

export const GetVideoGameInputSchema = {
    id: z.number().describe("Video game ID to retrieve"),
};

export const ListVideoGamesInputSchema = {
    platform: PlatformEnum.optional().describe("Filter by platform"),
    minRating: z.number().optional().describe("Minimum average rating (1-10)"),
    search: z.string().optional().describe("Search in title and description"),
    limit: z.number().optional().describe("Maximum number of results (default 50)"),
    offset: z.number().optional().describe("Number of results to skip (default 0)"),
};