import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ASCII version used to live at /ascii; it is now the homepage.
  async redirects() {
    return [{ source: "/ascii", destination: "/", permanent: true }];
  },
};

export default nextConfig;
