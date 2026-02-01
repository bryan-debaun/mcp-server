import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListAuthorsInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "list-authors";
const config = {
    title: "List Authors",
    description: "List authors with optional search filter (public)",
    inputSchema: ListAuthorsInputSchema
};

export function registerListAuthorsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { search, limit = 50, offset = 0 } = args;

                const where: any = {};

                if (search) {
                    where.OR = [
                        { name: { contains: search, mode: 'insensitive' } },
                        { bio: { contains: search, mode: 'insensitive' } }
                    ];
                }

                const authors = await prisma.author.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    include: {
                        books: {
                            include: {
                                book: true
                            }
                        },
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    },
                    orderBy: {
                        name: 'asc'
                    }
                });

                const results = authors.map((author: any) => ({
                    ...author,
                    bookCount: author.books.length
                }));

                return createSuccessResult({
                    authors: results,
                    total: results.length,
                    limit,
                    offset
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
