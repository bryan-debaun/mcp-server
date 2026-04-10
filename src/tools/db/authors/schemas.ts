// Input schemas for author-related MCP tools
import { z } from "zod";

export const CreateAuthorInputSchema = {
    name: z.string().describe("Author name"),
    bio: z.string().optional().describe("Author biography"),
    website: z.string().optional().describe("Author website URL"),
};

export const UpdateAuthorInputSchema = {
    id: z.number().describe("Author ID"),
    name: z.string().optional().describe("Author name"),
    bio: z.string().optional().describe("Author biography"),
    website: z.string().optional().describe("Author website URL"),
};

export const DeleteAuthorInputSchema = {
    id: z.number().describe("Author ID to delete"),
};

export const GetAuthorInputSchema = {
    id: z.number().describe("Author ID to retrieve"),
};

export const ListAuthorsInputSchema = {
    search: z.string().optional().describe("Search in author name and bio"),
    limit: z.number().optional().describe("Maximum number of results (default 50)"),
    offset: z.number().optional().describe("Number of results to skip (default 0)"),
};
