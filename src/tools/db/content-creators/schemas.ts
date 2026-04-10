// Input schemas for content creator-related MCP tools
import { z } from "zod";

export const CreateContentCreatorInputSchema = {
    name: z.string().describe("Content creator name"),
    description: z.string().optional().describe("Description of content creator"),
    website: z.string().optional().describe("Website URL"),
};

export const UpdateContentCreatorInputSchema = {
    id: z.number().describe("Content creator ID"),
    name: z.string().optional().describe("Content creator name"),
    description: z.string().optional().describe("Description of content creator"),
    website: z.string().optional().describe("Website URL"),
};

export const DeleteContentCreatorInputSchema = {
    id: z.number().describe("ContentCreator ID to delete"),
};

export const GetContentCreatorInputSchema = {
    id: z.number().describe("ContentCreator ID to retrieve"),
};

export const ListContentCreatorsInputSchema = {
    search: z.string().optional().describe("Search in name and description"),
    limit: z.number().optional().describe("Maximum number of results (default 50)"),
    offset: z.number().optional().describe("Number of results to skip (default 0)"),
};