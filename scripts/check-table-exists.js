import { PrismaClient } from '@prisma/client';
(async () => {
    const prisma = new PrismaClient();
    try {
        const rows = await prisma.$queryRawUnsafe("SELECT to_regclass('public.Profile') AS profile, to_regclass('public.User') AS user;");
        console.log(rows);
    } catch (err) {
        console.error('query failed', err);
    } finally {
        await prisma.$disconnect();
    }
})();
