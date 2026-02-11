import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHttpServer } from '../../src/http/server.js';
import type { Server } from 'http';

describe('tsoa movies controller', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = await startHttpServer(0, '127.0.0.1');
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    const authHeaders: HeadersInit | undefined = process.env.MCP_API_KEY ? { Authorization: `Bearer ${process.env.MCP_API_KEY}` } : undefined;

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('should return movies via tsoa controller GET /api/movies', async () => {
        const response = await fetch(`${baseUrl}/api/movies`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('movies');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.movies)).toBe(true);
    });

    it('should accept query parameters for GET /api/movies', async () => {
        const response = await fetch(`${baseUrl}/api/movies?limit=10&offset=0`, { headers: authHeaders });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('movies');
        expect(data).toHaveProperty('total');
    });

    it('should return movie by ID via tsoa controller GET /api/movies/:id', async () => {
        const response = await fetch(`${baseUrl}/api/movies/1`, { headers: authHeaders });
        expect([200, 404]).toContain(response.status);
    });
});