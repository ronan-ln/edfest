import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '127.0.2.2',
    'http://127.0.2.2:3000',
    'localhost',
    'http://localhost:3000',
    '192.168.0.185'
  ],
};

export default nextConfig;
