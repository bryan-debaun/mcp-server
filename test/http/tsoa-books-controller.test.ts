import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHttpApp, startHttpServer } from '../../src/http/server.js';
import type { Application } from 'express';
import type { Server } from 'http';

describe('tsoa books controller', () => {
    let app: Application;
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        app = await createHttpApp();
        server = await startHttpServer(app, '127.0.0.1', 0);
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should return books via tsoa controller GET /api/books', async () => {
        const response = await fetch(`${baseUrl}/api/books`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('books');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.books)).toBe(true);
    });

    it('should accept query parameters for GET /api/books', async () => {
        const response = await fetch(`${baseUrl}/api/books?limit=10&offset=0`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('books');
        expect(data).toHaveProperty('total');
    });

    it('should serve swagger spec at /docs/swagger.json', async () => {
        const response = await fetch(`${baseUrl}/docs/swagger.json`);
        expect(response.status).toBe(200);

        const spec = await response.json();
        expect(spec).toHaveProperty('openapi');
        expect(spec.openapi).toBe('3.0.0');
        expect(spec).toHaveProperty('paths');
        expect(spec.paths).toHaveProperty('/api/books');
    });
});
