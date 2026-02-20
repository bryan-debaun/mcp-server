import { prisma } from '../db/index.js'

/**
 * List all user profiles (single-user system: typically just the owner)
 */
export async function listUsers() {
    return prisma.profile.findMany()
}

/**
 * Register a new user profile
 * Note: For single-user personal website, this is typically not used.
 * Profile.id should match Supabase Auth user.id (UUID)
 */
export async function registerUser(id: string, email: string, name?: string) {
    // Prevent duplicate users
    const existing = await prisma.profile.findUnique({ where: { id } })
    if (existing) throw new Error('user already exists')

    const user = await prisma.profile.create({ 
        data: { 
            id, 
            email, 
            name 
        } 
    })

    return user
}
