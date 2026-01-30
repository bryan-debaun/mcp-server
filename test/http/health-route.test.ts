import request from "supertest";
import { createHttpApp } from "../../src/http/server";

describe("GET /healthz", () => {
    it("returns status ok and runtime info", async () => {
        const app = createHttpApp();
        const res = await request(app).get("/healthz").expect(200);
        expect(res.body).toHaveProperty("status", "ok");
        expect(res.body).toHaveProperty("uptime_seconds");
        expect(typeof res.body.uptime_seconds).toBe("number");
        expect(res.body).toHaveProperty("node");
    });
});
