import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListBooksInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { normalizeStatusInput, statusLabel } from "./status.js";
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
                const { authorId, minRating, search, status, limit = 50, offset = 0 } = args;

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

                // Filter by status if provided
                if (status !== undefined) {
                    const normalized = normalizeStatusInput(status);
                    if (normalized !== undefined) {
                        where.status = normalized;
                    }
                }

                // Filter by minimum rating (embedded column)
                if (minRating !== undefined) {
                    where.rating = { gte: minRating };
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
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                // Map results with embedded rating fields
                const results = books.map((book: any) => ({
                    ...book,
                    authors: book.authors.map((ba: any) => ba.author),
                    statusLabel: statusLabel(book.status)
                }));

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
