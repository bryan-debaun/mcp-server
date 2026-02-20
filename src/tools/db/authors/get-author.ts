import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetAuthorInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "get-author";
const config = {
    title: "Get Author",
    description: "Get an author by ID with their books (public)",
    inputSchema: GetAuthorInputSchema
};

export function registerGetAuthorTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;

                const author = await prisma.author.findUnique({
                    where: { id },
                    include: {
                        books: {
                            include: {
                                book: true
                            }
                        }
                    }
                });

                if (!author) {
                    return createErrorResult("Author not found");
                }

                // Return author with embedded book ratings
                return createSuccessResult(author);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
