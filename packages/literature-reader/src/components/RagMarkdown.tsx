import "katex/dist/katex.min.css";

import {
  type ComponentPropsWithoutRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useRef,
  useMemo,
  useState,
  useEffect,
  useId,
} from "react";
import { Download, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { rehypeStreamTail, type RehypeStreamTailOptions } from "./rehypeStreamTail";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { getReaderRuntime } from "../api/runtime";
import { cn } from "../lib/utils";

type RagMarkdownProps = {
  content?: string | null;
  compact?: boolean;
  tone?: "light" | "dark";
  enableMath?: boolean;
  className?: string;
  assetDocumentId?: string | null;
  citationReferences?: Record<string, RagCitationReferenceMeta>;
  onCitationClick?: (label: string) => void;
  renderMermaid?: boolean | "complete-blocks";
  streamTail?: RehypeStreamTailOptions | null;
};

export type RagCitationReferenceMeta = {
  label?: string;
  title?: string;
  available?: boolean;
  kind?: string;
};

const MARKDOWN_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, "math-inline", "math-display"],
    ],
  },
};

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
const CITATION_REFERENCE_URL_PREFIX = "#rag-citation-";
const CITATION_REFERENCE_PATTERN = /\[((?:A|W|T)?\d+)\]/gi;
const INTERNAL_EVIDENCE_REFERENCE_PATTERN = /\[(?:G|V)\d+\]/gi;
const remarkGfmStrict: [typeof remarkGfm, { singleTilde: boolean }] = [
  remarkGfm,
  { singleTilde: false },
];
const MARKDOWN_RANGE_PATTERN = /(?<=\p{N})-(?=\p{N})/gu;
const FENCE_START_PATTERN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)?.*$/;
const STRAY_BACKTICK_LINE_PATTERN = /^ {0,3}(`{1,2}|~{1,2})\s*$/;
const CHEMICAL_FORMULA_HINT_PATTERN =
  /^[A-Za-z0-9\s()[\]·.+\-−=,，:：;；₂₃₄₅₆₇₈₉₀₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+$/u;
const CODE_KEYWORD_PATTERN =
  /\b(import|export|const|let|var|function|class|return|if|else|for|while|async|await|select|insert|update|delete|from|where)\b/i;
const LATEX_COMMAND_HINT_PATTERN =
  /\\(?:begin|end|frac|dfrac|tfrac|sqrt|sum|prod|int|lim|text|mathrm|mathbf|mathit|cdot|times|div|pm|mp|leq|geq|neq|approx|sim|propto|alpha|beta|gamma|delta|Delta|theta|lambda|mu|pi|rho|sigma|omega|left|right|overline|underline|hat|bar|vec|dot|partial|nabla|infty|rightarrow|leftarrow|to)\b/;
const LATEX_STRUCTURE_HINT_PATTERN = /(?:[_^{}]|[=<>≈≤≥]|\\[()[\]])/;
const BRACKETED_CITATION_LIKE_PATTERN = /^\[(?:(?:A|W|T)?\d+|[GVC]\d+)\]$/i;
const MERMAID_RENDER_CACHE = new Map<string, string>();

type MarkdownAstNode = {
  type?: string;
  value?: string;
  url?: string;
  title?: string;
  children?: MarkdownAstNode[];
};

function isUnsafeUrl(value: string) {
  return /^\s*javascript:/i.test(value);
}

function normalizeRelativeAssetPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function resolveDocumentAssetUrl(
  src: string | undefined,
  assetDocumentId: string | null | undefined,
) {
  if (!src) {
    return undefined;
  }

  const trimmed = src.trim();
  if (!trimmed || isUnsafeUrl(trimmed)) {
    return undefined;
  }

  if (
    ABSOLUTE_URL_PATTERN.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }

  if (!assetDocumentId) {
    return trimmed;
  }

  const params = new URLSearchParams({
    path: normalizeRelativeAssetPath(trimmed),
  });
  return `${getReaderRuntime().baseUrl}/rag/docs/${assetDocumentId}/assets?${params.toString()}`;
}

function isProtectedApiAsset(url: string) {
  return url.startsWith(`${getReaderRuntime().baseUrl}/rag/docs/`);
}

function resolveMarkdownLink(
  href: string | undefined,
  assetDocumentId: string | null | undefined,
) {
  if (!href) {
    return undefined;
  }

  const trimmed = href.trim();
  if (!trimmed || isUnsafeUrl(trimmed)) {
    return undefined;
  }

  if (
    ABSOLUTE_URL_PATTERN.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return trimmed;
  }

  if (!assetDocumentId) {
    return trimmed;
  }

  const params = new URLSearchParams({
    path: normalizeRelativeAssetPath(trimmed),
  });
  return `${getReaderRuntime().baseUrl}/rag/docs/${assetDocumentId}/assets?${params.toString()}`;
}

function normalizeCitationReferenceLabel(label: string) {
  return label.trim().replace(/^\[|\]$/g, "").toUpperCase();
}

function remarkInlineCitationReferences() {
  return (tree: MarkdownAstNode) => {
    transformCitationReferenceChildren(tree);
  };
}

function transformCitationReferenceChildren(node: MarkdownAstNode) {
  if (!node.children || shouldSkipCitationTransform(node)) {
    return;
  }

  const transformedChildren: MarkdownAstNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      transformedChildren.push(...splitCitationReferenceText(child.value));
      continue;
    }

    transformCitationReferenceChildren(child);
    transformedChildren.push(child);
  }
  node.children = transformedChildren;
}

function shouldSkipCitationTransform(node: MarkdownAstNode) {
  return [
    "link",
    "linkReference",
    "image",
    "imageReference",
    "definition",
    "code",
    "inlineCode",
  ].includes(node.type ?? "");
}

function splitCitationReferenceText(value: string): MarkdownAstNode[] {
  const parts: MarkdownAstNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  CITATION_REFERENCE_PATTERN.lastIndex = 0;

  while ((match = CITATION_REFERENCE_PATTERN.exec(value))) {
    const [raw, rawLabel] = match;
    if (!rawLabel) {
      continue;
    }

    if (match.index > cursor) {
      parts.push({
        type: "text",
        value: value.slice(cursor, match.index),
      });
    }

    const label = normalizeCitationReferenceLabel(rawLabel);
    parts.push({
      type: "link",
      url: `${CITATION_REFERENCE_URL_PREFIX}${encodeURIComponent(label)}`,
      title: `查看引用 ${label}`,
      children: [{ type: "text", value: raw }],
    });
    cursor = match.index + raw.length;
  }

  if (cursor < value.length) {
    parts.push({
      type: "text",
      value: value.slice(cursor),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", value }];
}

function parseCitationReferenceHref(href: string | undefined) {
  if (!href?.startsWith(CITATION_REFERENCE_URL_PREFIX)) {
    return null;
  }
  return normalizeCitationReferenceLabel(
    decodeURIComponent(href.slice(CITATION_REFERENCE_URL_PREFIX.length)),
  );
}

/**
 * 修复中文标点紧邻强调定界符时 `**粗体**` 不生效的问题。
 *
 * CommonMark 的 flanking 规则要求闭合定界符「右侧不是标点」或「左侧是空白/标点」。
 * 中文里常见的 `对**古菌（Archaea）**的完整介绍` 恰好两头都不满足：
 * 闭合的 `**` 左侧是 `）`（标点），右侧是 `的`（字母），于是不算 right-flanking，
 * 整段会原样显示成 `**古菌（Archaea）**`。
 *
 * 实测（micromark 4 / remark-parse 11）：
 *   原样               → 不解析
 *   闭合后插零宽空格    → 仍不解析（U+200B 属于 Cf，既非空白也非标点）
 *   闭合后插 NBSP      → 可解析，但会多出一个可见空格
 *   闭合前插零宽空格    → 可解析，且渲染结果完全看不出变化
 * 因此这里在「标点 + 强调定界符 + 非空白非标点」的闭合位置插入 U+200B。
 *
 * 代码块与行内代码必须原样保留，所以先按围栏/反引号切分，只处理代码之外的片段。
 */
const MARKDOWN_CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
/*
 * 注意 `(?!\s*_]*)` 这一段：`*` 与 `_` 本身也属于 Unicode 标点（Po / Pc），
 * 如果没有这个排除，`是**天然噬菌体**` 里的第一个 `*` 会被当成「标点」、
 * 第二个当成「定界符」，零宽空格就插进两个 `*` 中间，反而把本来正常的粗体拆坏。
 * 这里要求前一个字符必须是标点，但不能是定界符自身。
 */
const CJK_EMPHASIS_CLOSER_PATTERN = /(?![\s*_])(\p{P})(\*\*|\*)(?=[^\s\p{P}])/gu;

function normalizeCjkEmphasisBoundaries(content: string) {
  return content
    .split(MARKDOWN_CODE_SEGMENT_PATTERN)
    .map((segment, index) =>
      // split 带捕获组时，奇数项就是被捕获的代码片段，保持原样
      index % 2 === 1 ? segment : segment.replace(CJK_EMPHASIS_CLOSER_PATTERN, "$1\u200B$2"),
    )
    .join("");
}

function normalizeMarkdownRangeHyphens(content: string) {
  return content.replace(MARKDOWN_RANGE_PATTERN, "\u2011");
}

function stripInternalEvidenceReferenceLabels(content: string) {
  return content
    .replace(INTERNAL_EVIDENCE_REFERENCE_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([，,；;：:])\s+([。！？!?])/g, "$1$2");
}

function isLikelyAccidentalCodeFence(code: string, language?: string) {
  const normalized = code.trim();
  if (!normalized || language) {
    return false;
  }

  const lines = normalized.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 2 || normalized.length > 80) {
    return false;
  }

  if (CODE_KEYWORD_PATTERN.test(normalized)) {
    return false;
  }

  return CHEMICAL_FORMULA_HINT_PATTERN.test(normalized);
}

function normalizeAccidentalMarkdownCodeBlocks(content: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const result: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (STRAY_BACKTICK_LINE_PATTERN.test(line.trim())) {
      index += 1;
      continue;
    }

    const fence = FENCE_START_PATTERN.exec(line);
    if (!fence) {
      result.push(line);
      index += 1;
      continue;
    }

    const marker = fence[1] ?? "```";
    const language = (fence[2] ?? "").trim();
    const markerChar = marker[0] === "~" ? "~" : "`";
    const closePattern = new RegExp(`^ {0,3}${markerChar}{${marker.length},}\\s*$`);
    const body: string[] = [];
    let cursor = index + 1;
    let closed = false;

    while (cursor < lines.length) {
      const candidate = lines[cursor] ?? "";
      if (closePattern.test(candidate)) {
        closed = true;
        break;
      }
      body.push(candidate);
      cursor += 1;
    }

    if (closed && isLikelyAccidentalCodeFence(body.join("\n"), language)) {
      result.push(...body);
      index = cursor + 1;
      continue;
    }

    result.push(line);
    result.push(...body);
    if (closed) {
      result.push(lines[cursor] ?? "");
      index = cursor + 1;
    } else {
      index = cursor;
    }
  }

  return result.join("\n");
}

function normalizeLatexBody(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\\\\(?=[A-Za-z])/g, "\\")
    .trim();
}

function looksLikeLatexExpression(value: string) {
  const trimmed = normalizeLatexBody(value);
  if (!trimmed || BRACKETED_CITATION_LIKE_PATTERN.test(`[${trimmed}]`)) {
    return false;
  }

  const hasLatexCommand = LATEX_COMMAND_HINT_PATTERN.test(trimmed);
  if (hasLatexCommand && LATEX_STRUCTURE_HINT_PATTERN.test(trimmed)) {
    return true;
  }

  if (/\\begin\{[^}]+\}[\s\S]*\\end\{[^}]+\}/.test(trimmed)) {
    return true;
  }

  if (/\\[A-Za-z]+/.test(trimmed) && /[{}_^=]/.test(trimmed)) {
    return true;
  }

  const mostlyFormula =
    /^[A-Za-z0-9\s_^{}/\\().,，:：;；+\-−*=<>≈≤≥·×÷%]+$/u.test(trimmed) &&
    /[A-Za-z0-9)]\s*[=<>≈≤≥]\s*[A-Za-z0-9(\\]/.test(trimmed) &&
    /[+\-−*/\\^_{}=<>≈≤≥·×÷]/.test(trimmed);
  return mostlyFormula;
}

function normalizeDelimitedMath(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => {
      const normalized = normalizeLatexBody(body);
      return normalized ? `\n\n$$${normalized}$$\n\n` : "";
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (match, body: string) => {
      const normalized = normalizeLatexBody(body);
      return normalized && looksLikeLatexExpression(normalized) ? `$${normalized}$` : match;
    });
}

function normalizeBracketedLatexBlocks(content: string) {
  return content.replace(
    /(^|[^\]!])\[([^\[\]]{3,1800})\](?!\()/gms,
    (match, prefix: string, body: string) => {
      const normalized = normalizeLatexBody(body);
      if (!looksLikeLatexExpression(normalized)) {
        return match;
      }
      return `${prefix}\n\n$$${normalized}$$\n\n`;
    },
  );
}

function normalizeStandaloneLatexLines(content: string) {
  const lines = content.split("\n");
  const result: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed || trimmed.includes("$")) {
      result.push(line);
      index += 1;
      continue;
    }

    if (/^\\begin\{[^}]+\}/.test(trimmed)) {
      const block = [trimmed];
      let cursor = index + 1;
      let closed = /\\end\{[^}]+\}/.test(trimmed);
      while (!closed && cursor < lines.length) {
        const next = (lines[cursor] ?? "").trim();
        block.push(next);
        closed = /\\end\{[^}]+\}/.test(next);
        cursor += 1;
      }
      if (closed) {
        result.push(`$$${normalizeLatexBody(block.join("\n"))}$$`);
        index = cursor;
        continue;
      }
    }

    const isStandaloneLatex =
      looksLikeLatexExpression(trimmed) &&
      (trimmed.startsWith("\\") || LATEX_COMMAND_HINT_PATTERN.test(trimmed));
    if (isStandaloneLatex) {
      result.push(`$$${normalizeLatexBody(trimmed)}$$`);
    } else {
      result.push(line);
    }
    index += 1;
  }

  return result.join("\n");
}

function normalizeMathSegment(content: string) {
  return normalizeStandaloneLatexLines(
    normalizeBracketedLatexBlocks(normalizeDelimitedMath(content)),
  );
}

function normalizeMathMarkdownContent(content: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const result: string[] = [];
  const pendingPlain: string[] = [];
  let activeFence:
    | {
        markerChar: "`" | "~";
        length: number;
      }
    | null = null;

  const flushPlain = () => {
    if (pendingPlain.length === 0) {
      return;
    }
    result.push(...normalizeMathSegment(pendingPlain.join("\n")).split("\n"));
    pendingPlain.length = 0;
  };

  for (const line of lines) {
    if (activeFence) {
      result.push(line);
      const closePattern = new RegExp(
        `^ {0,3}${activeFence.markerChar}{${activeFence.length},}\\s*$`,
      );
      if (closePattern.test(line)) {
        activeFence = null;
      }
      continue;
    }

    const fence = FENCE_START_PATTERN.exec(line);
    if (fence) {
      flushPlain();
      const marker = fence[1] ?? "```";
      activeFence = {
        markerChar: marker[0] === "~" ? "~" : "`",
        length: marker.length,
      };
      result.push(line);
      continue;
    }

    pendingPlain.push(line);
  }

  flushPlain();
  return result.join("\n");
}

/**
 * 修复 AI 常写错的一种 mermaid 语法。
 *
 * mermaid 的类简写 `:::` **不能和箭头写在同一行且带空格**，例如
 *   `Start([产生]) ::: source --> Collect[收集]`
 * 会直接抛 `Parse error ... Expecting 'SEMI', 'NEWLINE' ...`。
 * 但把冒号两侧的空格去掉写成 `Start([产生]):::source --> Collect[收集]` 就完全合法，
 * 且语义不变（实测：原样渲染抛错，去空格后渲染成功）。
 *
 * 这里只做这一处最小改动 —— 不重排语句、不改 classDef，避免破坏本来正确的图。
 */
function repairMermaidSource(source: string) {
  return source.replace(/[ \t]*:::[ \t]*/g, ":::");
}

function mermaidBlockKey(code: string) {
  return code.trim().replace(/\r\n?/g, "\n");
}

function collectClosedMermaidBlockKeys(content: string) {
  const closedBlocks = new Set<string>();
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let active:
    | {
        marker: string;
        language: string;
        lines: string[];
      }
    | null = null;

  for (const line of lines) {
    if (!active) {
      const match = FENCE_START_PATTERN.exec(line);
      if (!match) {
        continue;
      }
      active = {
        marker: match[1] ?? "```",
        language: (match[2] ?? "").toLowerCase(),
        lines: [],
      };
      continue;
    }

    const trimmed = line.trim();
    const closesFence =
      trimmed.startsWith(active.marker[0] ?? "`") &&
      trimmed.match(new RegExp(`^${active.marker[0] === "`" ? "`" : "~"}{${active.marker.length},}\\s*$`));
    if (closesFence) {
      if (active.language === "mermaid") {
        closedBlocks.add(mermaidBlockKey(active.lines.join("\n")));
      }
      active = null;
      continue;
    }

    active.lines.push(line);
  }

  return closedBlocks;
}

function MarkdownImage({
  src,
  alt,
  title,
  compact,
  tone,
  assetDocumentId,
  className,
}: {
  src?: string;
  alt?: string;
  title?: string;
  compact: boolean;
  tone: "light" | "dark";
  assetDocumentId?: string | null;
  className?: string;
}) {
  const resolvedSrc = useMemo(
    () => resolveDocumentAssetUrl(src, assetDocumentId),
    [assetDocumentId, src],
  );
  const [displaySrc, setDisplaySrc] = useState<string | null>(
    resolvedSrc && !isProtectedApiAsset(resolvedSrc) ? resolvedSrc : null,
  );
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    resolvedSrc ? "idle" : "error",
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadProtectedImage(url: string) {
      if (!isProtectedApiAsset(url)) {
        setDisplaySrc(url);
        setLoadState("ready");
        return;
      }

      setLoadState("loading");
      setDisplaySrc(null);

      async function requestWithToken() {
        const { getAccessToken, refreshAccessToken } = getReaderRuntime();
        let token = getAccessToken?.() ?? null;
        if (!token && refreshAccessToken) {
          token = await refreshAccessToken();
        }

        let response = await fetch(url, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (response.status === 401 && refreshAccessToken) {
          const refreshedToken = await refreshAccessToken();
          response = await fetch(url, {
            credentials: "include",
            headers: refreshedToken
              ? { Authorization: `Bearer ${refreshedToken}` }
              : undefined,
          });
        }

        return response;
      }

      try {
        const response = await requestWithToken();
        if (!response.ok) {
          throw new Error(`Failed to load image asset: ${response.status}`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setDisplaySrc(objectUrl);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) {
          setDisplaySrc(null);
          setLoadState("error");
        }
      }
    }

    if (!resolvedSrc) {
      setDisplaySrc(null);
      setLoadState("error");
      return () => undefined;
    }

    void loadProtectedImage(resolvedSrc);

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [resolvedSrc]);

  if (!resolvedSrc) {
    return null;
  }

  return (
    <figure className="my-4">
      <div
        className={cn(
          "overflow-hidden rounded-2xl border p-3",
          tone === "dark"
            ? "border-white/10 bg-white/[0.055] shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
            : "border-ink-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f6f7fb_100%)] shadow-[0_16px_34px_rgba(15,23,42,0.06)]",
          compact ? "rounded-xl p-2.5" : "rounded-2xl p-3.5",
          className,
        )}
      >
        {displaySrc ? (
          <img
            src={displaySrc}
            alt={alt ?? ""}
            title={title}
            loading="lazy"
            decoding="async"
            className={cn(
              "mx-auto h-auto w-full rounded-xl object-contain",
              compact ? "max-h-[220px]" : "max-h-[360px]",
            )}
          />
        ) : loadState === "loading" ? (
          <div
            className={cn(
              "flex w-full items-center justify-center rounded-xl text-sm",
              tone === "dark"
                ? "bg-ink-950/70 text-ink-300"
                : "bg-ink-100/90 text-ink-500",
              compact ? "min-h-[120px]" : "min-h-[180px]",
            )}
          >
            加载图片中…
          </div>
        ) : (
          <div
            className={cn(
              "flex w-full items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm",
              tone === "dark"
                ? "border-white/15 bg-ink-950/70 text-ink-400"
                : "border-ink-300 bg-ink-50/90 text-ink-500",
              compact ? "min-h-[120px]" : "min-h-[180px]",
            )}
          >
            图片加载失败
          </div>
        )}
      </div>
      {alt ? (
        <figcaption
          className={cn(
            "mt-2 text-xs leading-5",
            tone === "dark" ? "text-ink-400" : "text-ink-500",
          )}
        >
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
}

function MarkdownTable({
  tone,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"table"> & { tone: "light" | "dark" }) {
  return (
    <div
      className={cn(
        "my-4 overflow-x-auto rounded-2xl border",
        tone === "dark"
          ? "border-white/10 bg-white/[0.045] shadow-[0_14px_30px_rgba(0,0,0,0.18)]"
          : "border-ink-200/80 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.05)]",
      )}
    >
      <table className={cn("min-w-full border-collapse", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

function MermaidPendingBlock({
  code,
  tone,
}: {
  code: string;
  tone: "light" | "dark";
}) {
  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-2xl border",
        tone === "dark"
          ? "border-white/10 bg-white/[0.045]"
          : "border-ink-200 bg-white",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b px-3 py-2 text-xs font-semibold",
          tone === "dark"
            ? "border-white/10 text-ink-300"
            : "border-ink-100 text-ink-500",
        )}
      >
        <span>Mermaid 图表代码生成中</span>
        <span className="rounded-full bg-info-50 px-2 py-0.5 text-[11px] text-info-600">
          完成后自动渲染
        </span>
      </div>
      <pre
        className={cn(
          "h-[32vh] max-h-[360px] min-h-[220px] overflow-auto px-3 py-2 text-xs leading-5",
          tone === "dark" ? "bg-ink-950/80 text-ink-100" : "bg-ink-50 text-ink-700",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownCodeBlock({
  children,
  className,
  tone,
  ...props
}: ComponentPropsWithoutRef<"code"> & { tone: "light" | "dark" }) {
  return (
    <code
      {...props}
      className={cn(
        "my-3 block overflow-x-auto whitespace-pre rounded-lg px-3 py-2.5 font-mono text-[13px] leading-6",
        tone === "dark"
          ? "border border-white/10 bg-ink-950/90 text-ink-100 shadow-[0_18px_32px_rgba(15,23,42,0.14)]"
          : "border border-ink-200/80 bg-ink-100 text-ink-800 shadow-[0_14px_24px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {children}
    </code>
  );
}

function MermaidBlock({
  code,
  tone,
}: {
  code: string;
  tone: "light" | "dark";
}) {
  const codeKey = useMemo(() => mermaidBlockKey(repairMermaidSource(code)), [code]);
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  /** mermaid 输出的原始尺寸（取自 svg 的 viewBox） */
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [dragState, setDragState] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const chartId = useMemo(
    () => `rag-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const zoomPercent = Math.round(zoom * 100);
  const clampZoom = (value: number) => Math.min(3, Math.max(0.45, value));
  const applyZoom = (nextZoom: number) => {
    setZoom(clampZoom(Number(nextZoom.toFixed(2))));
  };
  const resetView = () => {
    setZoom(1);
    // 复位时把滚动区域也带回左上角
    const node = canvasRef.current;
    if (node) {
      node.scrollLeft = 0;
      node.scrollTop = 0;
    }
  };

  /**
   * 100% = 适应画布宽度（不放大超过原始尺寸）；其余比例在此基础上乘算。
   * 实际渲染尺寸 = 原始尺寸 × fitScale × zoom，并据此撑开可滚动区域，
   * 这样放大后画布真的变大，可以一路拖到图的任意角落，而不是被固定的 pan 上限卡住。
   */
  const fitScale = useMemo(() => {
    if (!naturalSize.width || !canvasSize.width) return 1;
    return Math.min(1, canvasSize.width / naturalSize.width);
  }, [naturalSize.width, canvasSize.width]);
  const renderScale = fitScale * zoom;
  const renderedWidth = Math.max(1, Math.round(naturalSize.width * renderScale));
  const renderedHeight = Math.max(1, Math.round(naturalSize.height * renderScale));
  const downloadSvg = () => {
    if (!svg) {
      return;
    }
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${chartId}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  /*
   * 不监听滚轮/触控板：像 ChatGPT 一样只用按钮缩放。
   * 触控板双指滑动保留给「滚动查看」，这本来也是放大后最自然的平移方式。
   */
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const node = canvasRef.current;
    if (!node) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: node.scrollLeft,
      scrollTop: node.scrollTop,
    });
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const node = canvasRef.current;
    if (!node) return;
    node.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
    node.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
  };
  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const source = code.trim();
    if (!source) {
      setSvg(null);
      setError("图表内容为空");
      return;
    }

    const cachedSvg = MERMAID_RENDER_CACHE.get(codeKey);
    if (cachedSvg) {
      setSvg(cachedSvg);
      setError(null);
      return;
    }

    setError(null);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        const mermaidApi = mermaid as typeof mermaid & {
          parse?: (
            text: string,
            options?: { suppressErrors?: boolean },
          ) => Promise<unknown> | unknown;
        };
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: tone === "dark" ? "dark" : "base",
          // 默认的 basis 曲线会让连线绕出没有规律的弯（尤其是长距离回边）。
          // monotoneX 同样是平滑曲线，但单调不过冲，走向规整得多。
          flowchart: {
            curve: "monotoneX",
            nodeSpacing: 42,
            rankSpacing: 52,
            padding: 12,
          },
          themeVariables:
            tone === "dark"
              ? {
                  background: "transparent",
                  primaryColor: "#151a27",
                  primaryTextColor: "#e7e9f0",
                  primaryBorderColor: "#5a72e2",
                  lineColor: "#8598ee",
                  secondaryColor: "#172554",
                  tertiaryColor: "#111827",
                }
              : {
                  background: "transparent",
                  primaryColor: "#f0f2fe",
                  primaryTextColor: "#151a27",
                  primaryBorderColor: "#8598ee",
                  lineColor: "#2f74c9",
                  secondaryColor: "#e7f7f2",
                  tertiaryColor: "#f6f7fb",
                },
        });
        const safeSource = repairMermaidSource(source);
        if (mermaidApi.parse) {
          const parseResult = await mermaidApi.parse(safeSource, { suppressErrors: true });
          if (parseResult === false) {
            throw new Error("Mermaid 语法不完整");
          }
        }
        const rendered = await mermaid.render(chartId, safeSource);
        if (/Syntax error in text|mermaid version/i.test(rendered.svg)) {
          throw new Error("Mermaid syntax is invalid");
        }
        if (!cancelled) {
          MERMAID_RENDER_CACHE.set(codeKey, rendered.svg);
          setSvg(rendered.svg);
        }
      })
      .catch((renderError) => {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Mermaid 渲染失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chartId, code, codeKey, tone]);

  // 量取 mermaid 输出的原始尺寸（svg 的 viewBox 就是它的自然大小）
  useEffect(() => {
    if (!svg) {
      setNaturalSize({ width: 0, height: 0 });
      return;
    }
    const holder = document.createElement("div");
    holder.innerHTML = svg;
    const svgNode = holder.querySelector("svg");
    const viewBox = svgNode?.viewBox?.baseVal;
    const width = viewBox?.width || Number(svgNode?.getAttribute("width")) || 0;
    const height = viewBox?.height || Number(svgNode?.getAttribute("height")) || 0;
    if (width > 0 && height > 0) {
      setNaturalSize({ width: Math.round(width), height: Math.round(height) });
    } else {
      setNaturalSize({ width: 0, height: 0 });
    }
  }, [svg]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setCanvasSize((prev) => {
        const next = { width: Math.round(width), height: Math.round(height) };
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fullscreen]);

  if (error) {
    return (
      <div
        className={cn(
          "my-4 rounded-2xl border p-3",
          tone === "dark"
            ? "border-white/10 bg-white/[0.045] text-ink-200"
            : "border-ink-200 bg-ink-50 text-ink-700",
        )}
      >
        <p className="text-xs font-semibold text-ink-800">Mermaid 图表暂时无法渲染，已保留源码</p>
        <p className="mt-1 mb-2 break-words font-mono text-[11px] leading-5 text-ink-500">
          {error}
        </p>
        <pre className="max-h-72 overflow-auto rounded-xl bg-ink-950 px-3 py-2 text-xs leading-5 text-ink-100">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  const renderToolbar = (inFullscreen = false) => (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b px-3 py-2 text-xs",
        inFullscreen
          ? "border-white/10 bg-white/[0.04] text-white/80"
          : tone === "dark"
            ? "border-white/10 text-ink-300"
            : "border-ink-100 text-ink-500",
      )}
    >
      <span className="truncate font-semibold">Mermaid 图表</span>
      <div
        className={cn(
          "flex items-center gap-1 rounded-full p-1 shadow-sm",
          inFullscreen
            ? "border border-white/10 bg-white/10 text-white"
            : "border border-ink-200/80 bg-white/90 text-ink-600",
        )}
      >
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40",
            inFullscreen ? "hover:bg-white/10" : "hover:bg-ink-100",
          )}
          title="缩小"
          disabled={zoom <= 0.45}
          onClick={() => applyZoom(zoom - 0.15)}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-12 text-center text-[11px] font-semibold tabular-nums">
          {zoomPercent}%
        </span>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40",
            inFullscreen ? "hover:bg-white/10" : "hover:bg-ink-100",
          )}
          title="放大"
          disabled={zoom >= 3}
          onClick={() => applyZoom(zoom + 0.15)}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition",
            inFullscreen ? "hover:bg-white/10" : "hover:bg-ink-100",
          )}
          title="恢复 100%"
          onClick={resetView}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition",
            inFullscreen ? "hover:bg-white/10" : "hover:bg-ink-100",
          )}
          title="下载 SVG"
          disabled={!svg}
          onClick={downloadSvg}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition",
            inFullscreen ? "hover:bg-white/10" : "hover:bg-ink-100",
          )}
          title={inFullscreen ? "退出全屏" : "全屏预览"}
          onClick={() => setFullscreen(!inFullscreen)}
        >
          {inFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );

  const renderCanvas = (inFullscreen = false) => (
    <div
      className={cn(
        "select-none overflow-auto overscroll-contain bg-ink-50/70",
        inFullscreen ? "h-[calc(100vh-4rem)] bg-ink-950/20" : "h-[38vh] max-h-[460px] min-h-[260px]",
        dragState ? "cursor-grabbing" : "cursor-grab",
      )}
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      title="按住拖动查看，使用按钮缩放"
      data-testid="mermaid-canvas"
    >
      {svg && naturalSize.width > 0 ? (
        /*
         * 关键：按「缩放后的尺寸」撑开真正的滚动内容。
         * SVG 是矢量的，直接给出目标宽高即可，无需 transform，
         * 放大后滚动区域随之变大，整张图都能拖到。
         */
        <div className="grid min-h-full min-w-full place-items-center p-3">
          <div
            className="[&_svg]:!block [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
            style={{ width: renderedWidth, height: renderedHeight }}
            data-rendered-size={`${renderedWidth}x${renderedHeight}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : svg ? (
        <div
          className="flex h-full items-center justify-center [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-ink-500">
          正在渲染 Mermaid 图表…
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "my-2 overflow-hidden rounded-2xl border shadow-[0_14px_24px_rgba(15,23,42,0.06)]",
          tone === "dark"
            ? "border-white/10 bg-white/[0.04]"
            : "border-info-100 bg-white",
        )}
      >
        {renderToolbar(false)}
        {renderCanvas(false)}
      </div>
      {fullscreen ? (
        <div className="fixed inset-0 z-[90] bg-ink-950/90 p-4 backdrop-blur-md">
          <div className="mx-auto flex h-full max-w-[96vw] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
            {renderToolbar(true)}
            {renderCanvas(true)}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function RagMarkdown({
  content,
  compact = false,
  tone = "light",
  enableMath = true,
  className,
  assetDocumentId,
  citationReferences,
  onCitationClick,
  renderMermaid = true,
  streamTail = null,
}: RagMarkdownProps) {
  const safeContent = typeof content === "string" ? content : "";
  const citationReferenceByLabel = useMemo(() => {
    const references: Record<string, RagCitationReferenceMeta> = {};
    for (const [label, meta] of Object.entries(citationReferences ?? {})) {
      references[normalizeCitationReferenceLabel(label)] = meta;
    }
    return references;
  }, [citationReferences]);
  const enableCitationReferences =
    Boolean(onCitationClick) || Object.keys(citationReferenceByLabel).length > 0;
  const normalizedContent = useMemo(() => {
    const visibleReferenceContent = stripInternalEvidenceReferenceLabels(safeContent);
    const rangeSafeContent = normalizeMarkdownRangeHyphens(visibleReferenceContent);
    const cleanedContent = normalizeAccidentalMarkdownCodeBlocks(rangeSafeContent);
    const emphasisSafeContent = normalizeCjkEmphasisBoundaries(cleanedContent);
    return enableMath ? normalizeMathMarkdownContent(emphasisSafeContent) : emphasisSafeContent;
  }, [safeContent, enableMath]);
  const closedMermaidBlockKeys = useMemo(
    () => collectClosedMermaidBlockKeys(normalizedContent),
    [normalizedContent],
  );
  const remarkPlugins = useMemo(() => {
    if (enableCitationReferences) {
      return enableMath
        ? [remarkGfmStrict, remarkMath, remarkInlineCitationReferences]
        : [remarkGfmStrict, remarkInlineCitationReferences];
    }
    return enableMath ? [remarkGfmStrict, remarkMath] : [remarkGfmStrict];
  }, [enableCitationReferences, enableMath]);

  const rehypePlugins = useMemo(() => {
    const plugins: NonNullable<Options["rehypePlugins"]> = enableMath
      ? [rehypeRaw, [rehypeSanitize, MARKDOWN_SCHEMA], rehypeKatex]
      : [rehypeRaw, [rehypeSanitize, MARKDOWN_SCHEMA]];
    if (streamTail && (streamTail.chunkLengths?.length ?? 0) > 0) {
      plugins.push([rehypeStreamTail, { chunkLengths: streamTail.chunkLengths }] as never);
    }
    return plugins;
  }, [enableMath, streamTail]);

  const components: Components = {
    a({ href, className: linkClassName, children, ...props }) {
      const citationLabel = parseCitationReferenceHref(href);
      if (citationLabel) {
        const reference = citationReferenceByLabel[citationLabel];
        const available = Boolean(onCitationClick && reference);
        return (
          <button
            type="button"
            disabled={!available}
            aria-label={
              available
                ? `查看引用 ${citationLabel}${reference?.title ? `：${reference.title}` : ""}`
                : `当前回答没有匹配到引用 ${citationLabel}`
            }
            title={
              available
                ? reference?.title
                  ? `查看引用 ${citationLabel}：${reference.title}`
                  : `查看引用 ${citationLabel}`
                : `当前回答没有匹配到引用 ${citationLabel}`
            }
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (available) {
                onCitationClick?.(citationLabel);
              }
            }}
            className={cn(
              "mx-0.5 inline-flex h-5 min-w-5 translate-y-[-1px] items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold leading-none transition",
              tone === "dark"
                ? available
                  ? "border-info-200/25 bg-info-200/10 text-info-100 shadow-[0_6px_14px_rgba(34,211,238,0.12)] hover:-translate-y-0.5 hover:border-info-100/45 hover:bg-info-100/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-info-300/45"
                  : "cursor-not-allowed border-white/10 bg-white/5 text-ink-500"
                : available
                  ? "border-info-200 bg-info-50 text-info-700 shadow-[0_6px_14px_rgba(14,165,233,0.12)] hover:-translate-y-0.5 hover:border-info-300 hover:bg-white hover:text-info-800 focus:outline-none focus:ring-2 focus:ring-info-300 focus:ring-offset-1"
                  : "cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400",
            )}
          >
            [{citationLabel}]
          </button>
        );
      }

      const resolvedHref = resolveMarkdownLink(href, assetDocumentId);
      return (
        <a
          {...props}
          href={resolvedHref}
          target={resolvedHref?.startsWith("#") ? undefined : "_blank"}
          rel={resolvedHref?.startsWith("#") ? undefined : "noreferrer"}
          className={cn(
            "font-medium underline underline-offset-4 transition-colors",
            tone === "dark"
              ? "text-info-200 decoration-info-300/45 hover:text-white hover:decoration-info-100"
              : "text-info-700 decoration-info-300 hover:text-info-800 hover:decoration-info-500",
            linkClassName,
          )}
        >
          {children}
        </a>
      );
    },
    img({ src, alt, title, className: imageClassName }) {
      return (
        <MarkdownImage
          src={src}
          alt={alt}
          title={title}
          compact={compact}
          tone={tone}
          assetDocumentId={assetDocumentId}
          className={imageClassName}
        />
      );
    },
    table({ className: tableClassName, children, ...props }) {
      return (
        <MarkdownTable tone={tone} className={tableClassName} {...props}>
          {children}
        </MarkdownTable>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    code(props) {
      const {
        inline,
        className: codeClassName,
        children,
        ...rest
      } = props as ComponentPropsWithoutRef<"code"> & { inline?: boolean };
      const codeText = String(children ?? "").replace(/\n$/, "");
      const isInlineCode = inline === true || (!codeClassName && !codeText.includes("\n"));

      if (isInlineCode) {
        return (
          <code
            {...rest}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-[0.92em]",
              tone === "dark"
                ? "border border-white/10 bg-white/10 text-info-100"
                : "bg-ink-100 text-ink-700",
              codeClassName,
            )}
          >
            {children}
          </code>
        );
      }

      const language = /language-(\w+)/.exec(codeClassName ?? "")?.[1]?.toLowerCase();
      if (language === "mermaid" && renderMermaid) {
        if (
          renderMermaid === "complete-blocks" &&
          !closedMermaidBlockKeys.has(mermaidBlockKey(codeText))
        ) {
          return <MermaidPendingBlock code={codeText} tone={tone} />;
        }
        return <MermaidBlock code={codeText} tone={tone} />;
      }

      return <MarkdownCodeBlock {...rest} className={codeClassName} tone={tone}>{children}</MarkdownCodeBlock>;
    },
  };

  return (
    <div
      className={cn(
        "min-w-0 break-words",
        tone === "dark" ? "text-ink-200" : "text-ink-700",
        compact ? "text-[13px] leading-6" : "text-[15px] leading-7",
        "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-1.5",
        "[&_tbody_tr:last-child_td]:border-b-0",
        "[&_.katex]:text-[1.02em] [&_.katex-display]:my-4 [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:rounded-xl [&_.katex-display]:px-1 [&_.katex-display]:py-2",
        tone === "dark"
          ? [
              "[&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-white",
              "[&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white",
              "[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white",
              "[&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-white",
              "[&_h5]:mt-3 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:tracking-[0.08em] [&_h5]:text-ink-300",
              "[&_h6]:mt-3 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:text-ink-300",
              "[&_hr]:my-5 [&_hr]:border-white/10",
              "[&_blockquote]:my-4 [&_blockquote]:rounded-r-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-info-300/50 [&_blockquote]:bg-info-300/10 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-ink-200",
              "[&_thead]:bg-white/5",
              "[&_th]:border-b [&_th]:border-white/10 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-ink-300",
              "[&_td]:border-b [&_td]:border-white/10 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top",
              "[&_strong]:font-semibold [&_strong]:text-white",
              "[&_em]:text-ink-300",
              "[&_del]:text-ink-500",
            ]
          : [
              "[&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-ink-900",
              "[&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-900",
              "[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink-900",
              "[&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-ink-900",
              "[&_h5]:mt-3 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:uppercase [&_h5]:tracking-[0.08em] [&_h5]:text-ink-700",
              "[&_h6]:mt-3 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:text-ink-700",
              "[&_hr]:my-5 [&_hr]:border-ink-200",
              "[&_blockquote]:my-4 [&_blockquote]:rounded-r-2xl [&_blockquote]:border-l-4 [&_blockquote]:border-info-300 [&_blockquote]:bg-info-50/80 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-ink-700",
              "[&_thead]:bg-ink-50",
              "[&_th]:border-b [&_th]:border-ink-200 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-ink-500",
              "[&_td]:border-b [&_td]:border-ink-100 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top",
              "[&_strong]:font-semibold [&_strong]:text-ink-900",
              "[&_em]:text-ink-600",
              "[&_del]:text-ink-400",
            ],
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
