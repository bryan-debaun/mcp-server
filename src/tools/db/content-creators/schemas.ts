// Input schemas for content creator-related MCP tools

export const CreateContentCreatorInputSchema = {
    type: "object",
    properties: {
        name: { type: "string", description: "Content creator name" },
        description: { type: "string", description: "Description of content creator" },
        website: { type: "string", description: "Website URL" },
        createdBy: { type: "number", description: "User ID of creator (optional)" },
    },
    required: ["name"],
} as const;

export const UpdateContentCreatorInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "Content creator ID" },
        name: { type: "string", description: "Content creator name" },
        description: { type: "string", description: "Description of content creator" },
        website: { type: "string", description: "Website URL" },
    },
    required: ["id"],
} as const;

export const DeleteContentCreatorInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "ContentCreator ID to delete" },
    },
    required: ["id"],
} as const;

export const GetContentCreatorInputSchema = {
    type: "object",
    properties: {
        id: { type: "number", description: "ContentCreator ID to retrieve" },
    },
    required: ["id"],
} as const;

export const ListContentCreatorsInputSchema = {
    type: "object",
    properties: {
        search: { type: "string", description: "Search in name and description" },
        limit: { type: "number", description: "Maximum number of results (default 50)" },
        offset: { type: "number", description: "Number of results to skip (default 0)" },
    },
    required: [],
} as const;