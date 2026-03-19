/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Allow both .js and .ts files
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
};

export default nextConfig;
