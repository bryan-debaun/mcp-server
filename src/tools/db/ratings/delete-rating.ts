import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DeleteRatingInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";


const name = "delete-rating";
const config = {
    title: "Delete Rating",
    description: "Delete a rating (owner or admin only)",
    inputSchema: DeleteRatingInputSchema
};

export function registerDeleteRatingTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;

                // Perform delete and recompute aggregates in a transaction
                const result = await prisma.$transaction(async (tx: any) => {
                    const rating = await tx.rating.delete({ where: { id } });

                    // Lock the book row to avoid races
                    await tx.$executeRaw`SELECT id FROM "Book" WHERE id = ${rating.bookId} FOR UPDATE`;

                    const agg = await tx.rating.aggregate({
                        where: { bookId: rating.bookId },
                        _count: { _all: true },
                        _avg: { rating: true }
                    });

                    const count = agg._count?._all || 0;
                    const avg = agg._avg?.rating !== null && agg._avg?.rating !== undefined
                        ? Number(Number(agg._avg.rating).toFixed(2))
                        : null;

                    await tx.book.update({
                        where: { id: rating.bookId },
                        data: {
                            ratingCount: count,
                            averageRating: avg
                        }
                    });

                    // Upsert into RatingAggregate as well for polymorphic support
                    await tx.ratingAggregate.upsert({
                        where: { entityType_entityId: { entityType: 'book', entityId: rating.bookId } },
                        create: { entityType: 'book', entityId: rating.bookId, ratingCount: count, averageRating: avg },
                        update: { ratingCount: count, averageRating: avg }
                    });

                    return rating;
                });

                return createSuccessResult({ message: "Rating deleted successfully", rating: result });
            } catch (error) {
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
