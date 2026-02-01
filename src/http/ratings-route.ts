import { Application, Request, Response } from 'express';
import { jwtMiddleware } from '../auth/jwt.js';

export function registerRatingsRoute(app: Application) {
    const base = '/api/ratings';

    // Public: List ratings
    app.get(base, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const { bookId, userId, limit, offset } = req.query;
            const result = await callTool('list-ratings', {
                bookId: bookId ? Number(bookId) : undefined,
                userId: userId ? Number(userId) : undefined,
                limit: limit ? Number(limit) : undefined,
                offset: offset ? Number(offset) : undefined
            });
            res.json(result);
        } catch (err: any) {
            console.error('list-ratings failed', err);
            res.status(500).json({ error: 'Failed to list ratings' });
        }
    });

    // Authenticated: Get current user's ratings
    app.get('/api/users/me/ratings', jwtMiddleware, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const userId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const result = await callTool('list-ratings', { userId });
            res.json(result);
        } catch (err: any) {
            console.error('list-ratings failed', err);
            res.status(500).json({ error: 'Failed to list ratings' });
        }
    });

    // Authenticated: Create or update rating
    app.post(base, jwtMiddleware, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const { bookId, rating, review } = req.body;
            if (!bookId || !rating) {
                return res.status(400).json({ error: 'bookId and rating are required' });
            }
            if (rating < 1 || rating > 10) {
                return res.status(400).json({ error: 'rating must be between 1 and 10' });
            }
            const userId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const result = await callTool('create-or-update-rating', {
                bookId: Number(bookId),
                userId,
                rating: Number(rating),
                review
            });
            res.status(201).json(result);
        } catch (err: any) {
            console.error('create-or-update-rating failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Book not found' });
            }
            res.status(500).json({ error: 'Failed to create or update rating' });
        }
    });

    // Authenticated: Delete rating (owner or admin)
    app.delete(`${base}/:id`, jwtMiddleware, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        const { prisma } = await import('../db/index.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid rating ID' });
            }
            const userId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined;
            const userRole = (req as any).user?.role;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Check ownership unless admin
            if (userRole !== 'admin') {
                const rating = await prisma.rating.findUnique({ where: { id } });
                if (!rating) {
                    return res.status(404).json({ error: 'Rating not found' });
                }
                if (rating.userId !== userId) {
                    return res.status(403).json({ error: 'You can only delete your own ratings' });
                }
            }

            const result = await callTool('delete-rating', { id });
            res.json(result);
        } catch (err: any) {
            console.error('delete-rating failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Rating not found' });
            }
            res.status(500).json({ error: 'Failed to delete rating' });
        }
    });
}
