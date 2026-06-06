import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: [
    "@nextday/game-client",
    "@nextday/game-rules",
    "@nextday/shared",
    "@nextday/ui",
  ],
};

export default nextConfig;
