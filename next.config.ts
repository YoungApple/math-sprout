import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  // Native / Node-only packages must not be bundled by webpack.
  serverExternalPackages: ["@libsql/client", "@google-cloud/storage"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
