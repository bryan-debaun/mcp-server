import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
    RepoSchema,
    IssueNumberSchema,
    GetOpenIssuesInputSchema,
    GetIssueInputSchema,
    CreateIssueInputSchema,
    UpdateIssueInputSchema,
    CloseIssueInputSchema
} from "../../../src/tools/github-issues/schemas.js";

describe("schemas", () => {
    describe("RepoSchema", () => {
        it("should accept valid owner/repo format", () => {
            expect(RepoSchema.parse("owner/repo")).toBe("owner/repo");
            expect(RepoSchema.parse("my-org/my-repo")).toBe("my-org/my-repo");
        });

        it("should reject invalid formats", () => {
            expect(() => RepoSchema.parse("invalid")).toThrow();
            expect(() => RepoSchema.parse("too/many/slashes")).toThrow();
            expect(() => RepoSchema.parse("")).toThrow();
        });
    });

    describe("IssueNumberSchema", () => {
        it("should accept positive integers", () => {
            expect(IssueNumberSchema.parse(1)).toBe(1);
            expect(IssueNumberSchema.parse(100)).toBe(100);
        });

        it("should reject non-positive numbers", () => {
            expect(() => IssueNumberSchema.parse(0)).toThrow();
            expect(() => IssueNumberSchema.parse(-1)).toThrow();
        });

        it("should reject non-integers", () => {
            expect(() => IssueNumberSchema.parse(1.5)).toThrow();
        });
    });

    describe("GetOpenIssuesInputSchema", () => {
        const schema = z.object(GetOpenIssuesInputSchema);

        it("should accept valid input with required fields", () => {
            const result = schema.parse({ repo: "owner/repo" });
            expect(result.repo).toBe("owner/repo");
            expect(result.limit).toBe(10); // default
        });

        it("should accept optional fields", () => {
            const result = schema.parse({
                repo: "owner/repo",
                labels: "bug,help-wanted",
                limit: 25
            });
            expect(result.labels).toBe("bug,help-wanted");
            expect(result.limit).toBe(25);
        });
    });

    describe("GetIssueInputSchema", () => {
        const schema = z.object(GetIssueInputSchema);

        it("should require both repo and issueNumber", () => {
            const result = schema.parse({ repo: "owner/repo", issueNumber: 42 });
            expect(result.repo).toBe("owner/repo");
            expect(result.issueNumber).toBe(42);
        });

        it("should reject missing fields", () => {
            expect(() => schema.parse({ repo: "owner/repo" })).toThrow();
            expect(() => schema.parse({ issueNumber: 42 })).toThrow();
        });
    });

    describe("CreateIssueInputSchema", () => {
        const schema = z.object(CreateIssueInputSchema);

        it("should require repo and title", () => {
            const result = schema.parse({ repo: "owner/repo", title: "Test Issue" });
            expect(result.title).toBe("Test Issue");
        });

        it("should accept optional body and labels", () => {
            const result = schema.parse({
                repo: "owner/repo",
                title: "Test",
                body: "Description",
                labels: "bug"
            });
            expect(result.body).toBe("Description");
            expect(result.labels).toBe("bug");
        });

        it("should reject empty title", () => {
            expect(() => schema.parse({ repo: "owner/repo", title: "" })).toThrow();
        });
    });

    describe("UpdateIssueInputSchema", () => {
        const schema = z.object(UpdateIssueInputSchema);

        it("should require repo and issueNumber", () => {
            const result = schema.parse({ repo: "owner/repo", issueNumber: 1 });
            expect(result.repo).toBe("owner/repo");
            expect(result.issueNumber).toBe(1);
        });

        it("should accept all optional update fields", () => {
            const result = schema.parse({
                repo: "owner/repo",
                issueNumber: 1,
                title: "New Title",
                body: "New Body",
                labels: "enhancement",
                comment: "A comment"
            });
            expect(result.title).toBe("New Title");
            expect(result.comment).toBe("A comment");
        });
    });

    describe("CloseIssueInputSchema", () => {
        const schema = z.object(CloseIssueInputSchema);

        it("should require repo and issueNumber", () => {
            const result = schema.parse({ repo: "owner/repo", issueNumber: 1 });
            expect(result.repo).toBe("owner/repo");
        });

        it("should accept optional comment", () => {
            const result = schema.parse({
                repo: "owner/repo",
                issueNumber: 1,
                comment: "Closing because done"
            });
            expect(result.comment).toBe("Closing because done");
        });
    });
});
