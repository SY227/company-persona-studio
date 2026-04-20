import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
