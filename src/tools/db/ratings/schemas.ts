// Input schemas for rating-related MCP tools

export const CreateOrUpdateRatingInputSchema = {
    type: "object",
    properties: {
        bookId: { type: "number", description: "Book ID to rate" },
        userId: { type: "number", description: "User ID creating the rating" },
        rating: { type: "number", description: "Rating value (1-10)", minimum: 1, maximum: 10 },
        review: { type: "string", description: "Optional review text" },
    },
    required: ["bookId", "userId", "rating"],
} as const;

export const DeleteRatingInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Rating ID to delete" },
    },
    required: ["id"],
} as const;

export const ListRatingsInputSchema = {
    type: "object",
    properties: {
        bookId: { type: "number", description: "Filter by book ID" },
        userId: { type: "number", description: "Filter by user ID" },
        limit: { type: "number", description: "Maximum number of results (default 50)" },
        offset: { type: "number", description: "Number of results to skip (default 0)" },
    },
    required: [],
} as const;
