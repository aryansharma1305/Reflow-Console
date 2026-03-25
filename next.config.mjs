/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  // Allow both .js and .ts files
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
};

export default nextConfig;
