import request from "supertest";
import { createHttpApp } from "../../src/http/server";

describe("GET /api/playback", () => {
    it("returns playback JSON with expected fields", async () => {
        const app = createHttpApp();
        const res = await request(app).get("/api/playback").expect(200);
        expect(res.body).toHaveProperty("source", "spotify");
        expect(res.body).toHaveProperty("timestamp");
        expect(typeof res.body.is_playing).toBe("boolean");
    });
});
