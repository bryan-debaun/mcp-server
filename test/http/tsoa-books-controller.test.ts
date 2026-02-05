import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHttpServer } from '../../src/http/server.js';
import type { Server } from 'http';

describe('tsoa books controller', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = await startHttpServer(0, '127.0.0.1');
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    const authHeaders = process.env.MCP_API_KEY ? { Authorization: `Bearer ${process.env.MCP_API_KEY}` } : {};


    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should return books via tsoa controller GET /api/books', async () => {
        const response = await fetch(`${baseUrl}/api/books`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('books');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.books)).toBe(true);
    });

    it('should accept query parameters for GET /api/books', async () => {
        const response = await fetch(`${baseUrl}/api/books?limit=10&offset=0`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('books');
        expect(data).toHaveProperty('total');
    });

    it('should accept status query parameter for GET /api/books', async () => {
        const response = await fetch(`${baseUrl}/api/books?status=Not%20started`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('books');
        expect(data).toHaveProperty('total');
    });

    it('should serve swagger spec at /docs/swagger.json', async () => {
        const response = await fetch(`${baseUrl}/docs/swagger.json`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const spec = await response.json();
        expect(spec).toHaveProperty('openapi');
        expect(spec.openapi).toBe('3.0.0');
        expect(spec).toHaveProperty('paths');
        expect(spec.paths).toHaveProperty('/api/books');
        expect(spec.paths).toHaveProperty('/api/books/{id}');
        expect(spec.paths).toHaveProperty('/api/authors');
        expect(spec.paths).toHaveProperty('/api/authors/{id}');
        expect(spec.paths).toHaveProperty('/api/ratings');

        // ItemStatus enum should be present and referenced by Book
        expect(spec).toHaveProperty('components');
        expect(spec.components).toHaveProperty('schemas');
        expect(spec.components.schemas).toHaveProperty('ItemStatus');
        expect(Array.isArray(spec.components.schemas.ItemStatus.enum)).toBe(true);
        expect(spec.components.schemas.ItemStatus.enum).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
        expect(spec.components.schemas.Book.properties.status.$ref).toBe('#/components/schemas/ItemStatus');
        expect(spec.components.schemas.CreateBookRequest.properties.status.$ref).toBe('#/components/schemas/ItemStatus');

    });

    it('should return book by ID via tsoa controller GET /api/books/:id', async () => {
        const response = await fetch(`${baseUrl}/api/books/1`, { headers: authHeaders });
        // Gracefully handles non-existent IDs (returns 404 or empty)
        expect([200, 404]).toContain(response.status);
    });

    it('should return authors via tsoa controller GET /api/authors', async () => {
        const response = await fetch(`${baseUrl}/api/authors`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('authors');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.authors)).toBe(true);
    });

    it('should return author by ID via tsoa controller GET /api/authors/:id', async () => {
        const response = await fetch(`${baseUrl}/api/authors/1`, { headers: authHeaders });
        // Gracefully handles non-existent IDs
        expect([200, 404]).toContain(response.status);
    });

    it('should return ratings via tsoa controller GET /api/ratings', async () => {
        const response = await fetch(`${baseUrl}/api/ratings`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('ratings');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.ratings)).toBe(true);
    });
});
