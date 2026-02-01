import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListBooksInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "list-books";
const config = {
    title: "List Books",
    description: "List books with optional filters (author, rating, search) (public)",
    inputSchema: ListBooksInputSchema
};

export function registerListBooksTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { authorId, minRating, search, limit = 50, offset = 0 } = args;

                // Build where clause
                const where: any = {};

                if (authorId) {
                    where.authors = {
                        some: {
                            authorId
                        }
                    };
                }

                if (search) {
                    where.OR = [
                        { title: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } }
                    ];
                }

                const books = await prisma.book.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    include: {
                        authors: {
                            include: {
                                author: true
                            }
                        },
                        ratings: true,
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                // Filter by min rating if specified and calculate avg rating for each
                let results = books.map((book: any) => {
                    const avgRating = book.ratings.length > 0
                        ? book.ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / book.ratings.length
                        : null;

                    return {
                        ...book,
                        averageRating: avgRating,
                        ratingCount: book.ratings.length
                    };
                });

                if (minRating !== undefined) {
                    results = results.filter((book: any) =>
                        book.averageRating !== null && book.averageRating >= minRating
                    );
                }

                return createSuccessResult({
                    books: results,
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
