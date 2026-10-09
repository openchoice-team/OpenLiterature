#!/usr/bin/env node
/**
 * Patch the vendored EmbedPDF runtime so its BioEdu-custom controls follow
 * the reader locale. Hardcoded Chinese literals are replaced with expressions
 * reading `globalThis.__ODHU_*` overrides (falling back to the original
 * Chinese). `EmbedPdfLiteratureViewer` sets those overrides per locale.
 *
 * Run after copying a fresh `public/embedpdf` bundle:
 *   node scripts/patch-embedpdf-i18n.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "apps/demo/public/embedpdf");

const bundle = readdirSync(target).find((file) => /^embedpdf-.*\.js$/.test(file));
if (!bundle) {
  console.error("embedpdf bundle not found in", target);
  process.exit(1);
}

const file = join(target, bundle);
let source = readFileSync(file, "utf8");

if (source.includes("__ODHU_AI_ASSIST_LABEL__")) {
  console.log("already patched:", bundle);
  process.exit(0);
}

const replacements = [
  ['"AI 助读、文献提问与学习目标"', '(globalThis.__ODHU_AI_HINT__||"AI 助读、文献提问与学习目标")'],
  ['"关闭研读助手"', '(globalThis.__ODHU_ASSISTANT_CLOSE__||"关闭研读助手")'],
  ['},"关闭")', '},(globalThis.__ODHU_CLOSE__||"关闭"))'],
  ['"第 1 页到 ".concat(k," 页")', '(globalThis.__ODHU_PAGE_RANGE__?globalThis.__ODHU_PAGE_RANGE__(k):"第 1 页到 ".concat(k," 页"))'],
  ['"评论区"', '(globalThis.__ODHU_COMMENTS_TITLE__||"评论区")'],
  ['"研读助手"', '(globalThis.__ODHU_ASSISTANT_TITLE__||"研读助手")'],
  ['label:"AI 助读"', 'label:(globalThis.__ODHU_AI_ASSIST_LABEL__||"AI 助读")'],
  ['label:"AI 解读"', 'label:(globalThis.__ODHU_EXPLAIN_LABEL__||"AI 解读")'],
  ['label:"提问"', 'label:(globalThis.__ODHU_ASK_LABEL__||"提问")'],
  ['UC={', 'UC=globalThis.__ODHU_UC__={'],
  [
    '?(globalThis.__ODHU_COMMENTS_TITLE__||"评论区"):"AI 助读"',
    '?(globalThis.__ODHU_COMMENTS_TITLE__||"评论区"):(globalThis.__ODHU_ASSISTANT_TAB__||"AI 助读")',
  ],
];

for (const [from, to] of replacements) {
  const count = source.split(from).length - 1;
  if (count === 0) {
    console.warn(`pattern not found (skipped): ${from}`);
    continue;
  }
  source = source.split(from).join(to);
  console.log(`replaced ${count}x: ${from}`);
}

writeFileSync(file, source);
console.log("patched:", file);
