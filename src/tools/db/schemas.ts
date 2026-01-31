import { z } from "zod";

/** Schemas for db tools inputs */
export const CreateInviteInputSchema = {
    email: z.string().email().describe("Email address to invite"),
    invitedBy: z.number().int().optional().describe("Actor user id who invited")
};

export const AcceptInviteInputSchema = {
    token: z.string().min(1).describe("Invite token"),
    name: z.string().optional().describe("Optional display name for new user"),
    password: z.string().optional().describe("Optional password for provisioning")
};

export const GetUserInputSchema = {
    id: z.number().int().optional().describe("User id"),
    email: z.string().email().optional().describe("User email")
};

export const ListUsersInputSchema = {};

export const ListInvitesInputSchema = {};

export const ListAuditLogsInputSchema = {
    limit: z.number().int().positive().default(50).describe("Maximum number of logs to return")
};
