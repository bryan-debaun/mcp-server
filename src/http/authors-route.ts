import { Application, Request, Response } from 'express';
import { jwtMiddleware } from '../auth/jwt.js';
import { requireAdmin } from '../auth/requireAdmin.js';

export function registerAuthorsRoute(app: Application) {
    const base = '/api/authors';

    // Public: List authors
    app.get(base, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const { search, limit, offset } = req.query;
            const result = await callTool('list-authors', {
                search: search as string,
                limit: limit ? Number(limit) : undefined,
                offset: offset ? Number(offset) : undefined
            });
            res.json(result);
        } catch (err: any) {
            console.error('list-authors failed', err);
            res.status(500).json({ error: 'Failed to list authors' });
        }
    });

    // Public: Get author by ID
    app.get(`${base}/:id`, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid author ID' });
            }
            const result = await callTool('get-author', { id });
            res.json(result);
        } catch (err: any) {
            console.error('get-author failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Author not found' });
            }
            res.status(500).json({ error: 'Failed to get author' });
        }
    });

    // Admin: Create author
    app.post(base, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const { name, bio, website } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'name is required' });
            }
            const createdBy = (req as any).user?.sub ? Number((req as any).user.sub) : undefined;
            const result = await callTool('create-author', {
                name,
                bio,
                website,
                createdBy
            });
            res.status(201).json(result);
        } catch (err: any) {
            console.error('create-author failed', err);
            res.status(500).json({ error: 'Failed to create author' });
        }
    });

    // Admin: Update author
    app.put(`${base}/:id`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid author ID' });
            }
            const { name, bio, website } = req.body;
            const result = await callTool('update-author', {
                id,
                name,
                bio,
                website
            });
            res.json(result);
        } catch (err: any) {
            console.error('update-author failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Author not found' });
            }
            res.status(500).json({ error: 'Failed to update author' });
        }
    });

    // Admin: Delete author
    app.delete(`${base}/:id`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { callTool } = await import('../tools/local.js');
        try {
            const id = Number(req.params.id);
            if (isNaN(id)) {
                return res.status(400).json({ error: 'Invalid author ID' });
            }
            const result = await callTool('delete-author', { id });
            res.json(result);
        } catch (err: any) {
            console.error('delete-author failed', err);
            if (err.message?.includes('not found')) {
                return res.status(404).json({ error: 'Author not found' });
            }
            res.status(500).json({ error: 'Failed to delete author' });
        }
    });
}
