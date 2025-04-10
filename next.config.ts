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
  webpack: (config, { isServer }) => {
    // Required for projects using viem
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Support for web workers - only in client builds
    if (!isServer) {
      config.module.rules.push({
        test: /\.worker\.js$/,
        use: {
          loader: 'worker-loader',
          options: {
            filename: 'static/chunks/[name].[contenthash].js',
            publicPath: '/_next/',
          },
        },
      });
    }

    // Support for transformers.js - ignore node-specific modules
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    };

    return config;
  },
};

export default nextConfig;
