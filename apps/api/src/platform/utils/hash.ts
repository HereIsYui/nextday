import { createHash } from "node:crypto";

export function sha256Digest(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashRequestBody(body: unknown): string {
  return createHash("sha256")
    .update(stableStringify(body ?? {}))
    .digest("hex");
}

export function getRequestIp(input: {
  ip?: string;
  headers?: { [key: string]: string | string[] | undefined };
}): string | undefined {
  const forwardedFor = input.headers?.["x-forwarded-for"];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0];
  }

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return input.ip;
}
