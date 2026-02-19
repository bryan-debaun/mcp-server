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
                const { bookId, entityType: argEntityType, entityId: argEntityId, userId, rating, review } = args;

                // Determine target entity (backwards-compatible with bookId)
                const entityType = argEntityType ?? (bookId !== undefined ? 'book' : undefined);
                const entityId = argEntityId ?? (bookId !== undefined ? bookId : undefined);

                if (!entityType || entityId === undefined) {
                    return createErrorResult('entityType and entityId (or bookId) are required');
                }

                // Validate rating range
                if (rating < 1 || rating > 10) {
                    return createErrorResult("Rating must be between 1 and 10");
                }

                // Perform the upsert and update aggregates inside a single transaction
                const ratingRecord = await prisma.$transaction(async (tx: any) => {
                    const r = await tx.rating.upsert({
                        where: {
                            entityType_entityId_userId: {
                                entityType,
                                entityId,
                                userId
                            }
                        },
                        create: {
                            entityType,
                            entityId,
                            userId,
                            rating,
                            review
                        },
                        update: {
                            rating,
                            review
                        },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    });

                    // Lock the entity row to avoid races and update aggregates for the specific entity type
                    if (entityType === 'book') {
                        await tx.$executeRaw`SELECT id FROM "Book" WHERE id = ${entityId} FOR UPDATE`;
                    } else if (entityType === 'movie') {
                        await tx.$executeRaw`SELECT id FROM "Movie" WHERE id = ${entityId} FOR UPDATE`;
                    } else if (entityType === 'videogame' || entityType === 'videogame' || entityType === 'videoGame') {
                        await tx.$executeRaw`SELECT id FROM "VideoGame" WHERE id = ${entityId} FOR UPDATE`;
                    }

                    // Compute aggregates generically from Rating table
                    const agg = await tx.rating.aggregate({
                        where: { entityType, entityId },
                        _count: { _all: true },
                        _avg: { rating: true }
                    });

                    const count = agg._count?._all || 0;
                    const avg = agg._avg?.rating !== null && agg._avg?.rating !== undefined
                        ? Number(Number(agg._avg.rating).toFixed(2))
                        : null;

                    // Persist aggregates back to the relevant parent table when applicable
                    if (entityType === 'book') {
                        await tx.book.update({
                            where: { id: entityId },
                            data: { ratingCount: count, averageRating: avg }
                        });
                    } else if (entityType === 'movie') {
                        await tx.movie.update({
                            where: { id: entityId },
                            data: { ratingCount: count, averageRating: avg }
                        });
                    } else if (entityType === 'videogame' || entityType === 'videoGame' || entityType === 'videogame') {
                        await tx.videoGame.update({
                            where: { id: entityId },
                            data: { ratingCount: count, averageRating: avg }
                        });
                    }

                    // Attach minimal entity info to the returned object for convenience
                    // Fetch the parent entity title for book/movie/videogame
                    if (entityType === 'book') {
                        const b = await tx.book.findUnique({ where: { id: entityId }, select: { id: true, title: true } });
                        return { ...r, book: b };
                    }
                    if (entityType === 'movie') {
                        const m = await tx.movie.findUnique({ where: { id: entityId }, select: { id: true, title: true } });
                        return { ...r, movie: m };
                    }
                    if (entityType === 'videogame' || entityType === 'videoGame') {
                        const g = await tx.videoGame.findUnique({ where: { id: entityId }, select: { id: true, title: true, platform: true } });
                        return { ...r, videoGame: g };
                    }

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
