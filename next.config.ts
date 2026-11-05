import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  outputFileTracingIncludes: { "/api/**": ["./fixtures/**"] },
  turbopack: { root: path.join(__dirname) },
};

export default config;
