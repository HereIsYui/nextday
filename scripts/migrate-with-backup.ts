import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "postgres"]);

if (!databaseUrl) {
  process.stderr.write("缺少 DATABASE_URL，已停止迁移以避免跳过数据库备份。\n");
  process.exitCode = 1;
} else {
  const parsedDatabaseUrl = parseDatabaseUrl(databaseUrl);
  const isLocalDatabase =
    parsedDatabaseUrl !== null && localDatabaseHosts.has(parsedDatabaseUrl.hostname);

  if (!parsedDatabaseUrl) {
    process.stderr.write("DATABASE_URL 格式无效，已停止迁移。\n");
    process.exitCode = 1;
  } else if (!isLocalDatabase && process.env.ALLOW_REMOTE_MIGRATION !== "true") {
    process.stderr.write(
      "拒绝迁移非本地数据库；如已确认远端备份与发布窗口，请显式设置 ALLOW_REMOTE_MIGRATION=true。\n",
    );
    process.exitCode = 1;
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDirectory = resolve(process.cwd(), "backups", "text-game-migration");
    const backupPath = resolve(backupDirectory, `before-migrate-${timestamp}.dump`);
    mkdirSync(backupDirectory, { recursive: true });

    const backup = createBackup(databaseUrl, backupPath, parsedDatabaseUrl, isLocalDatabase);

    if (backup.error || backup.status !== 0) {
      try {
        unlinkSync(backupPath);
      } catch {
        // 备份文件不存在或无法清理时，保留原始错误并中止迁移。
      }
      process.stderr.write("数据库备份失败，已停止 Prisma 迁移。\n");
      process.exitCode = backup.status || 1;
    } else {
      process.stdout.write(`数据库备份已生成：${backupPath}\n`);
      const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "inherit",
        env: process.env,
      });

      if (migration.error || migration.status !== 0) {
        process.exitCode = migration.status || 1;
      }
    }
  }
}

function parseDatabaseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function createBackup(
  databaseUrl: string,
  backupPath: string,
  parsedUrl: URL,
  isLocalDatabase: boolean,
) {
  const localPgDump = spawnSync("pg_dump", ["--version"], { stdio: "ignore", env: process.env });
  if (!localPgDump.error && localPgDump.status === 0) {
    return spawnSync("pg_dump", ["--format=custom", "--file", backupPath, databaseUrl], {
      stdio: "inherit",
      env: process.env,
    });
  }

  if (!isLocalDatabase) {
    return localPgDump;
  }

  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  if (!databaseName) {
    return localPgDump;
  }
  const output = openSync(backupPath, "w");
  try {
    return spawnSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "-e",
        `PGPASSWORD=${decodeURIComponent(parsedUrl.password)}`,
        "postgres",
        "pg_dump",
        "--format=custom",
        "--username",
        decodeURIComponent(parsedUrl.username),
        databaseName,
      ],
      {
        stdio: ["ignore", output, "inherit"],
        env: {
          ...process.env,
          PGPASSWORD: decodeURIComponent(parsedUrl.password),
        },
      },
    );
  } finally {
    closeSync(output);
  }
}
