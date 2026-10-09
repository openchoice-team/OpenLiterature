import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createClientId() {
  const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function parseOffsetDateTuple(value: number[]) {
  if (value.length < 6) {
    return null;
  }
  const [year, ordinalDay, hour, minute, second, nanosecond, offsetHour = 0, offsetMinute = 0, offsetSecond = 0] =
    value;
  if (
    ![year, ordinalDay, hour, minute, second, nanosecond, offsetHour, offsetMinute, offsetSecond].every(
      (item) => Number.isFinite(item)
    )
  ) {
    return null;
  }

  const utcMillis =
    Date.UTC(year, 0, 1 + ordinalDay - 1, hour, minute, second, Math.floor(nanosecond / 1_000_000)) -
    ((offsetHour * 3600 + offsetMinute * 60 + offsetSecond) * 1000);
  const date = new Date(utcMillis);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDate(value: unknown) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (!normalizedValue) return null;
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  if (Array.isArray(value)) {
    return parseOffsetDateTuple(value.map((item) => Number(item)));
  }
  return null;
}

export function formatDate(value?: unknown) {
  if (!value) return "-";
  const normalized = normalizeDate(value);
  if (!normalized) return String(value);
  if (typeof normalized === "string") return normalized;
  return normalized.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function clampText(value: string, max = 120) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function middleEllipsis(value: string, max = 44) {
  const text = value.trim();
  if (text.length <= max) return text;
  if (max <= 8) return `${text.slice(0, Math.max(1, max - 1))}...`;

  const extensionMatch = text.match(/(\.[^./\\\s]{1,12})$/);
  const extension = extensionMatch?.[1] ?? "";
  const stem = extension ? text.slice(0, -extension.length) : text;
  const available = Math.max(8, max - extension.length - 3);
  const headLength = Math.ceil(available * 0.58);
  const tailLength = Math.max(3, available - headLength);
  return `${stem.slice(0, headLength)}...${stem.slice(Math.max(headLength, stem.length - tailLength))}${extension}`;
}

export function getErrorMessage(error: unknown, fallback = "操作失败") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;
  const maybe = error as { message?: unknown };
  if (typeof maybe.message === "string") return maybe.message;
  return fallback;
}

export function getApiErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const maybe = error as { status?: unknown };
  if (typeof maybe.status !== "number" || !Number.isFinite(maybe.status)) {
    return null;
  }
  return maybe.status;
}

export function getApiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const maybe = error as { code?: unknown };
  if (typeof maybe.code !== "string" || !maybe.code.trim()) {
    return null;
  }
  return maybe.code;
}

export function isApiNotFoundError(error: unknown): boolean {
  return getApiErrorStatus(error) === 404;
}
