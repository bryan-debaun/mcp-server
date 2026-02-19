import { z } from "zod";

/** Schemas for db tools inputs */
export const GetUserInputSchema = {
    id: z.number().int().optional().describe("User id"),
    email: z.string().email().optional().describe("User email")
};

export const ListUsersInputSchema = {};
