import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  // Turbopack is the default in Next.js 16. @ducanh2912/next-pwa adds a webpack
  // config for service-worker generation. Declaring an (empty) turbopack config
  // silences the "webpack config with no turbopack config" fatal error so the
  // build can proceed; Turbopack simply ignores the webpack-specific SW config.
  turbopack: {},
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    skipWaiting: true,
  },
})(nextConfig);
