/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: isProd
        ? ["https://operix.cloud"]
        : ["http://localhost:3000", "http://127.0.0.1:3000"],
    },
  },

  output: "standalone",
};

export default nextConfig;
