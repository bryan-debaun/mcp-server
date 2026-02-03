// Input schemas for book-related MCP tools

export const CreateBookInputSchema = {
    type: "object",
    properties: {
        title: { type: "string", description: "Book title" },
        status: { type: "string", description: "Book status (e.g., Not started, In progress, Completed)", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        description: { type: "string", description: "Book description" },
        isbn: { type: "string", description: "ISBN (optional, must be unique)" },
        publishedAt: { type: "string", description: "Publication date (ISO 8601 format)" },
        authorIds: {
            type: "array",
            items: { type: "number" },
            description: "Array of author IDs to associate with this book"
        },
        createdBy: { type: "number", description: "User ID of creator (optional)" },
    },
    required: ["title"],
} as const;

export const UpdateBookInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Book ID" },
        title: { type: "string", description: "Book title" },
        status: { type: "string", description: "Book status (e.g., Not started, In progress, Completed)", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        description: { type: "string", description: "Book description" },
        isbn: { type: "string", description: "ISBN (must be unique)" },
        publishedAt: { type: "string", description: "Publication date (ISO 8601 format)" },
        authorIds: {
            type: "array",
            items: { type: "number" },
            description: "Array of author IDs to associate with this book"
        },
    },
    required: ["id"],
} as const;

export const DeleteBookInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Book ID to delete" },
    },
    required: ["id"],
} as const;

export const GetBookInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Book ID to retrieve" },
    },
    required: ["id"],
} as const;

export const ListBooksInputSchema = {
    type: "object",
    properties: {
        authorId: { type: "number", description: "Filter by author ID" },
        minRating: { type: "number", description: "Minimum average rating (1-10)" },
        search: { type: "string", description: "Search in title and description" },
        status: { type: "string", description: "Filter by status (Not started, In progress, Completed)", enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
        limit: { type: "number", description: "Maximum number of results (default 50)" },
        offset: { type: "number", description: "Number of results to skip (default 0)" },
    },
    required: [],
} as const;
