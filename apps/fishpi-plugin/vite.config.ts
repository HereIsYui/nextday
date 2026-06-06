import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@nextday/game-client": resolve(__dirname, "../../packages/game-client/src/index.ts"),
      "@nextday/game-rules": resolve(__dirname, "../../packages/game-rules/src/index.ts"),
      "@nextday/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        module: resolve(__dirname, "src/module.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [],
    },
  },
});
