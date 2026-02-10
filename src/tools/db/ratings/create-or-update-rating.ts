import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateOrUpdateRatingInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";


const name = "create-or-update-rating";
const config = {
    title: "Create or Update Rating",
    description: "Create a new rating or update existing rating for a book (authenticated users)",
    inputSchema: CreateOrUpdateRatingInputSchema
};

export function registerCreateOrUpdateRatingTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { bookId, userId, rating, review } = args;

                // Validate rating range
                if (rating < 1 || rating > 10) {
                    return createErrorResult("Rating must be between 1 and 10");
                }

                // Perform the upsert and update book aggregates inside a single transaction
                const ratingRecord = await prisma.$transaction(async (tx: any) => {
                    const r = await tx.rating.upsert({
                        where: {
                            bookId_userId: {
                                bookId,
                                userId
                            }
                        },
                        create: {
                            bookId,
                            userId,
                            rating,
                            review
                        },
                        update: {
                            rating,
                            review
                        },
                        include: {
                            book: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            },
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    });

                    // Lock the book row to avoid races
                    await tx.$executeRaw`SELECT id FROM "Book" WHERE id = ${bookId} FOR UPDATE`;

                    const agg = await tx.rating.aggregate({
                        where: { bookId },
                        _count: { _all: true },
                        _avg: { rating: true }
                    });

                    const count = agg._count?._all || 0;
                    const avg = agg._avg?.rating !== null && agg._avg?.rating !== undefined
                        ? Number(Number(agg._avg.rating).toFixed(2))
                        : null;

                    await tx.book.update({
                        where: { id: bookId },
                        data: {
                            ratingCount: count,
                            averageRating: avg
                        }
                    });

                    // Upsert into RatingAggregate as well for polymorphic support
                    await tx.ratingAggregate.upsert({
                        where: { entityType_entityId: { entityType: 'book', entityId: bookId } },
                        create: { entityType: 'book', entityId: bookId, ratingCount: count, averageRating: avg },
                        update: { ratingCount: count, averageRating: avg }
                    });

                    return r;
                });

                return createSuccessResult(ratingRecord);
            } catch (error) {
                // Increment metric tracking aggregate update failures (dynamic import to avoid import cycles in tests)
                try {
                    const m = await import('../../http/metrics-route');
                    (m as any).bookAggregateUpdateFailuresTotal?.inc?.();
                } catch (e) { /* ignore metric failures */ }
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
