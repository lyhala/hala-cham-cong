import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Ảnh nhân sự đã được thu nhỏ trên trình duyệt (thường < 500KB); chừa dư cho ảnh lớn
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
