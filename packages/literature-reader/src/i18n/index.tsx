import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { enUS, zhCN, type ReaderMessages } from "./messages";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const builtin: Record<string, ReaderMessages> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

const overrides: Record<string, ReaderMessages> = {};

export function normalizeLocale(value?: string | null): string {
  if (value && value.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en-US";
}

function detectLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return normalizeLocale(navigator.language);
  }
  return "en-US";
}

let currentLocale = detectLocale();

export function setReaderLocale(locale?: string | null) {
  currentLocale = normalizeLocale(locale);
}

export function getReaderLocale(): string {
  return currentLocale;
}

/** Register or extend the messages of a locale (merged over built-ins). */
export function registerReaderMessages(locale: string, messages: ReaderMessages) {
  const normalized = normalizeLocale(locale);
  overrides[normalized] = { ...overrides[normalized], ...messages };
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translateWith(
  locale: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const normalized = normalizeLocale(locale);
  const template =
    overrides[normalized]?.[key] ?? builtin[normalized]?.[key] ?? overrides["en-US"]?.[key] ?? enUS[key] ?? key;
  return interpolate(template, vars);
}

/** Translate with the currently active locale (usable outside React). */
export function translate(key: string, vars?: Record<string, string | number>): string {
  return translateWith(currentLocale, key, vars);
}

type I18nValue = {
  locale: string;
  t: Translate;
};

const I18nContext = createContext<I18nValue | null>(null);

export function ReaderI18nProvider({
  locale,
  messages,
  children,
}: {
  /** Any locale tag; `zh*` maps to zh-CN, everything else to en-US. */
  locale?: string;
  /** Optional message overrides/additions for the active locale. */
  messages?: ReaderMessages;
  children: ReactNode;
}) {
  const normalized = normalizeLocale(locale ?? currentLocale);

  useEffect(() => {
    if (locale) setReaderLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (messages) registerReaderMessages(normalized, messages);
  }, [messages, normalized]);

  const value = useMemo<I18nValue>(
    () => ({
      locale: normalized,
      t: (key, vars) => translateWith(normalized, key, vars),
    }),
    [normalized],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useReaderI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value) return value;
  return {
    locale: currentLocale,
    t: translate,
  };
}

export type { ReaderMessages };
