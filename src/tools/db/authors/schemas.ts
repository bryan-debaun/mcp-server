// Input schemas for author-related MCP tools

export const CreateAuthorInputSchema = {
    type: "object",
    properties: {
        name: { type: "string", description: "Author name" },
        bio: { type: "string", description: "Author biography" },
        website: { type: "string", description: "Author website URL" },
    },
    required: ["name"],
} as const;

export const UpdateAuthorInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Author ID" },
        name: { type: "string", description: "Author name" },
        bio: { type: "string", description: "Author biography" },
        website: { type: "string", description: "Author website URL" },
    },
    required: ["id"],
} as const;

export const DeleteAuthorInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Author ID to delete" },
    },
    required: ["id"],
} as const;

export const GetAuthorInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Author ID to retrieve" },
    },
    required: ["id"],
} as const;

export const ListAuthorsInputSchema = {
    type: "object",
    properties: {
        search: { type: "string", description: "Search in author name and bio" },
        limit: { type: "number", description: "Maximum number of results (default 50)" },
        offset: { type: "number", description: "Number of results to skip (default 0)" },
    },
    required: [],
} as const;
