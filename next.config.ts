import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Linting runs through `npm run lint`; the flat ESLint config has no Next plugin,
  // so `next build` skips its own lint step.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return {
      // The 8-bit character-sheet site is a build-free static page in public/.
      // beforeFiles so "/" resolves to it instead of requiring an app/ root route.
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
