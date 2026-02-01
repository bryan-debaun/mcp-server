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
                                book: {
                                    include: {
                                        ratings: true
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

                if (!author) {
                    return createErrorResult("Author not found");
                }

                // Enhance books with average ratings
                const authorWithRatings = {
                    ...author,
                    books: author.books.map((ba: any) => {
                        const book = ba.book;
                        const avgRating = book.ratings.length > 0
                            ? book.ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / book.ratings.length
                            : null;

                        return {
                            ...ba,
                            book: {
                                ...book,
                                averageRating: avgRating,
                                ratingCount: book.ratings.length
                            }
                        };
                    })
                };

                return createSuccessResult(authorWithRatings);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
