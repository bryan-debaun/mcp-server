// Input schemas for book-related MCP tools
import { z } from "zod";

const StatusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);

export const CreateBookInputSchema = {
    title: z.string().describe("Book title"),
    status: StatusEnum.optional().describe("Book status (e.g., Not started, In progress, Completed)"),
    description: z.string().optional().describe("Book description"),
    isbn: z.string().optional().describe("ISBN (optional, must be unique)"),
    publishedAt: z.string().optional().describe("Publication date (ISO 8601 format)"),
    rating: z.number().optional().describe("Your rating (1-10 scale, optional)"),
    review: z.string().optional().describe("Your review text (optional)"),
    authorIds: z.array(z.number()).optional().describe("Array of author IDs to associate with this book"),
};

export const UpdateBookInputSchema = {
    id: z.number().describe("Book ID"),
    title: z.string().optional().describe("Book title"),
    status: StatusEnum.optional().describe("Book status (e.g., Not started, In progress, Completed)"),
    description: z.string().optional().describe("Book description"),
    rating: z.number().optional().describe("Your rating (1-10 scale, optional)"),
    review: z.string().optional().describe("Your review text (optional)"),
    isbn: z.string().optional().describe("ISBN (must be unique)"),
    publishedAt: z.string().optional().describe("Publication date (ISO 8601 format)"),
    authorIds: z.array(z.number()).optional().describe("Array of author IDs to associate with this book"),
};

export const DeleteBookInputSchema = {
    id: z.number().describe("Book ID to delete"),
};

export const GetBookInputSchema = {
    id: z.number().describe("Book ID to retrieve"),
};

export const ListBooksInputSchema = {
    authorId: z.number().optional().describe("Filter by author ID"),
    minRating: z.number().optional().describe("Minimum average rating (1-10)"),
    search: z.string().optional().describe("Search in title and description"),
    status: StatusEnum.optional().describe("Filter by status (Not started, In progress, Completed)"),
    limit: z.number().optional().describe("Maximum number of results (default 50)"),
    offset: z.number().optional().describe("Number of results to skip (default 0)"),
};
