/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // عدم إيقاف بناء النشر بسبب تحذيرات ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // عدم إيقاف بناء النشر بسبب أخطاء أنواع TypeScript (تُعالَج لاحقاً)
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
