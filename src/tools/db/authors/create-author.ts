import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool } from "../../registration.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateAuthorInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "create-author";
const config = {
    title: "Create Author",
    description: "Create a new author (admin only)",
    inputSchema: CreateAuthorInputSchema
};

export function registerCreateAuthorTool(server: McpServer): void {
    registerTool(server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { name, bio, website } = args;

                const author = await prisma.author.create({
                    data: {
                        name,
                        bio,
                        website
                    }
                });

                return createSuccessResult(author);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
