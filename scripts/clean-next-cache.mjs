import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targetDir = process.argv[2];

if (!targetDir) {
  throw new Error("请传入需要清理的应用目录，例如 apps/web 或 .");
}

const nextCacheDir = resolve(process.cwd(), targetDir, ".next");
rmSync(nextCacheDir, { force: true, recursive: true });
