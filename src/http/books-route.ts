import { Application, Request, Response } from 'express';
import { jwtMiddleware } from '../auth/jwt.js';
import { requireAdmin } from '../auth/requireAdmin.js';

export function registerBooksRoute(app: Application) {
    const base = '/api/books';

    // Public: List books
    app.get(base, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const { authorId, minRating, search, status, limit, offset } = req.query;
            const result = await callTool('list-books', {
                authorId: authorId ? Number(authorId) : undefined,
                minRating: minRating ? Number(minRating) : undefined,
                search: search as string,
                status: status as string | undefined,
                limit: limit ? Number(limit) : undefined,
                offset: offset ? Number(offset) : undefined
            });
            res.json(result);
        } catch (err: any) {
            console.error('list-books failed', err);
            // Gracefully degrade: return empty list if database is unavailable
            res.json({ books: [], total: 0 });
        }
    });

    // Public: Get book by ID
    app.get(`${base}/:id`, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid book ID' });
            }
            const result = await callTool('get-book', { id });
            res.json(result);
        } catch (err: any) {
            console.error('get-book failed', err);
            // Gracefully degrade: return 404 if database is unavailable or book not found
            res.status(404).json({ error: 'Book not found' });
        }
    });

    // Admin: Create book
    app.post(base, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const { title, description, isbn, publishedAt, authorIds, status } = req.body;
            if (!title) {
                return res.status(400).json({ error: 'title is required' });
            }
            const createdBy = (req as any).user?.sub ? Number((req as any).user.sub) : undefined;
            const result = await callTool('create-book', {
                title,
                description,
                isbn,
                publishedAt,
                authorIds,
                status,
                createdBy
            });
            res.status(201).json(result);
        } catch (err: any) {
            console.error('create-book failed', err);
            if (err.message?.includes('Unique constraint')) {
                return res.status(400).json({ error: 'ISBN already exists' });
            }
            res.status(500).json({ error: 'Failed to create book' });
        }
    });

    // Admin: Update book
    app.put(`${base}/:id`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid book ID' });
            }
            const { title, description, isbn, publishedAt, authorIds, status } = req.body;
            const result = await callTool('update-book', {
                id,
                title,
                description,
                isbn,
                publishedAt,
                authorIds,
                status
            });
            res.json(result);
        } catch (err: any) {
            console.error('update-book failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Book not found' });
            }
            if (err.message?.includes('Unique constraint')) {
                return res.status(400).json({ error: 'ISBN already exists' });
            }
            res.status(500).json({ error: 'Failed to update book' });
        }
    });

    // Admin: Delete book
    app.delete(`${base}/:id`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid book ID' });
            }
            const result = await callTool('delete-book', { id });
            res.json(result);
        } catch (err: any) {
            console.error('delete-book failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Book not found' });
            }
            res.status(500).json({ error: 'Failed to delete book' });
        }
    });
}
