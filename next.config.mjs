/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist', 'sharp'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
