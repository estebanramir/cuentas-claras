/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  transpilePackages: ['@cuentas/shared', '@cuentas/db'],
};
