/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@chatnova/shared"],
  images: { unoptimized: true },
};

export default nextConfig;
