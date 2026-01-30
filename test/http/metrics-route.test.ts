import request from "supertest";
import { createHttpApp } from "../../src/http/server";

describe("GET /metrics", () => {
    it("returns prometheus metrics and includes key metrics", async () => {
        const app = createHttpApp();
        // make a request so http_requests_total is present
        await request(app).get("/healthz").expect(200);
        const res = await request(app).get("/metrics").expect(200);
        expect(res.text).toContain("http_requests_total");
        expect(res.text).toContain("mcp_poll_success_total");
    });
});
