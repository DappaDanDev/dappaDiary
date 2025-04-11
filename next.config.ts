import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    ANURA_API_KEY: process.env.ANURA_API_KEY,
    RECALL_PRIVATE_KEY: process.env.RECALL_PRIVATE_KEY,
  },
  images: {
    domains: ['anura-testnet.lilypad.tech'],
  },
};

export default nextConfig;
