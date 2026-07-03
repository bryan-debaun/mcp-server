// Input + document schemas for the résumé content resource (#147).
import { z } from 'zod'

// Lenient, top-level JSON Resume validation (the issue asks to "validate the
// top-level shape"). Inner entries stay open (`passthrough` / `z.any()`) because
// JSON Resume is extensible and the site may add fields over time.
export const PrivateContactSchema = z
    .object({
        email: z.string().optional(),
        phone: z.string().optional(),
    })
    .passthrough()

export const ResumeBasicsSchema = z
    .object({
        name: z.string(),
        label: z.string().optional(),
        url: z.string().optional(),
        summary: z.string().optional(),
        location: z.any().optional(),
        profiles: z.array(z.any()).optional(),
        privateContact: PrivateContactSchema.optional(),
    })
    .passthrough()

export const ResumeDocumentSchema = z
    .object({
        basics: ResumeBasicsSchema,
        work: z.array(z.any()).optional(),
        education: z.array(z.any()).optional(),
        skills: z.array(z.any()).optional(),
        projects: z.array(z.any()).optional(),
    })
    .passthrough()

export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>

export const GetResumeInputSchema = {
    includePrivate: z
        .boolean()
        .optional()
        .describe(
            'Include basics.privateContact (email/phone). Default false — public reads are stripped.',
        ),
}

export const UpdateResumeInputSchema = {
    document: ResumeDocumentSchema.describe(
        'The full JSON Resume document to store (replaces the singleton).',
    ),
}
