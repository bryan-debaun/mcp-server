import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetBookInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";
import { statusLabel } from "./status.js";

const name = "get-book";
const config = {
    title: "Get Book",
    description: "Get a book by ID with authors and ratings summary (public)",
    inputSchema: GetBookInputSchema
};

export function registerGetBookTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;

                const book = await prisma.book.findUnique({
                    where: { id },
                    include: {
                        authors: {
                            include: {
                                author: true
                            }
                        },
                        ratings: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true
                                    }
                                }
                            }
                        },
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                });

                if (!book) {
                    return createErrorResult("Book not found");
                }

                // Calculate average rating
                const avgRating = book.ratings.length > 0
                    ? book.ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / book.ratings.length
                    : null;

                return createSuccessResult({
                    ...book,
                    averageRating: avgRating,
                    ratingCount: book.ratings.length,
                    statusLabel: statusLabel(book.status)
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
