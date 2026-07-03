// Placeholder skeleton for the singleton résumé (#147). The real content lives in
// bryandebaun.dev's resume.json and is migrated in via PUT /api/resume (or the
// admin editor). Seeding only ensures the singleton row exists; it never
// overwrites an edited résumé (upsert uses `update: {}`).
export const resumeSkeleton = {
    basics: {
        name: '',
        label: '',
        url: '',
        summary: '',
        location: {},
        profiles: [],
        privateContact: { email: '', phone: '' },
    },
    work: [],
    education: [],
    skills: [],
    projects: [],
}
