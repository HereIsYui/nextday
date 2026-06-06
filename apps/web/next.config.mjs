import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const packageSourceAliases = {
  "@nextday/game-client$": join(workspaceRoot, "packages/game-client/src/index.ts"),
  "@nextday/game-client/health": join(workspaceRoot, "packages/game-client/src/health.ts"),
  "@nextday/game-rules$": join(workspaceRoot, "packages/game-rules/src/index.ts"),
  "@nextday/shared$": join(workspaceRoot, "packages/shared/src/index.ts"),
  "@nextday/ui$": join(workspaceRoot, "packages/ui/src/index.ts"),
};

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...packageSourceAliases,
    };

    return config;
  },
};

export default nextConfig;
