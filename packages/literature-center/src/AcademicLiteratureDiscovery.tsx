import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  CircleOff,
  Database,
  FileSearch,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useLiteratureCenterClient } from "./api/client";
import type {
  AcademicDiscoverySearchResponse,
  AcademicLiteratureState,
  AcademicLiteratureWork,
  AcademicOriginMetric,
  AcademicWorkRelation,
} from "./api/types";
import { getErrorMessage } from "./lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type AcademicLiteratureDiscoveryProps = {
  courseId: string;
  topicId?: string | null;
  embedded?: boolean;
  searchResult?: AcademicDiscoverySearchResponse | null;
};

const FILTERS: Array<{ value: "all" | AcademicLiteratureState; label: string }> = [
  { value: "all", label: "全部" },
  { value: "discovered", label: "新发现" },
  { value: "shortlisted", label: "稍后处理" },
  { value: "saved", label: "已收藏" },
];

type OriginCountMode = keyof AcademicOriginMetric;

const ORIGIN_MODES: Array<{ value: OriginCountMode; label: string; title: string }> = [
  { value: "full_count", label: "论文数", title: "一篇论文为每个署名机构记 1 次" },
  { value: "fractional_count", label: "分数计数", title: "一篇论文的 1 次贡献由全部署名机构平分" },
  { value: "corresponding_count", label: "通讯作者", title: "按通讯作者所属机构统计论文数" },
];

const LIFECYCLE_META: Record<
  string,
  { label: string; variant: "warning" | "danger" }
> = {
  corrected: { label: "已有修正", variant: "warning" },
  under_concern: { label: "表达关切", variant: "warning" },
  withdrawn: { label: "已撤回", variant: "danger" },
  retracted: { label: "已撤稿", variant: "danger" },
};

const RELATION_LABELS: Record<string, string> = {
  correction: "修正记录",
  expression_of_concern: "表达关切",
  withdrawal: "撤回记录",
  retraction: "撤稿记录",
  version: "版本关系",
  update: "更新记录",
  other: "关联记录",
};

const ACTIVE_FULLTEXT_STATUSES = new Set([
  "queued",
  "resolving",
  "downloading",
  "downloaded",
  "ingesting",
]);

const FULLTEXT_STATUS_LABELS: Record<string, string> = {
  queued: "等待获取开放全文",
  resolving: "正在确认开放全文地址",
  downloading: "正在获取开放全文",
  downloaded: "全文已获取，准备解析",
  ingesting: "正在解析全文",
  ready: "全文解析完成",
  failed: "开放全文获取失败",
  cancelled: "开放全文获取已取消",
};

function relationAffectsWork(work: AcademicLiteratureWork, relation: AcademicWorkRelation) {
  return (
    (relation.direction === "updated_by" && relation.work_id === work.id) ||
    (relation.direction === "updates" && relation.related_work_id === work.id)
  );
}

function relationDescription(work: AcademicLiteratureWork, relation: AcademicWorkRelation) {
  const label = RELATION_LABELS[relation.relation_kind] ?? "关联记录";
  if (relationAffectsWork(work, relation)) {
    if (relation.relation_kind === "correction") return "该文献已有修正";
    if (relation.relation_kind === "expression_of_concern") return "该文献已被发布表达关切";
    if (relation.relation_kind === "withdrawal") return "该文献已撤回";
    if (relation.relation_kind === "retraction") return "该文献已撤稿";
    return `${label}适用于当前文献`;
  }
  if (relation.direction === "updates") {
    return `当前记录用于${label.replace("记录", "")}相关文献`;
  }
  return label;
}

function counterpartDoi(work: AcademicLiteratureWork, relation: AcademicWorkRelation) {
  if (relation.work_id === work.id) {
    return relation.related_work_doi || relation.related_doi;
  }
  return relation.source_work_doi;
}

function relationDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function sourceName(relation: AcademicWorkRelation) {
  const source = relation.source_label?.toLowerCase();
  if (source === "publisher") return "出版社";
  if (source === "retraction-watch") return "Retraction Watch";
  if (source === "object" || source === "subject") return "Crossref 关系数据";
  return relation.source_label || (relation.provider === "crossref" ? "Crossref" : "OpenAlex");
}

const regionNames = (() => {
  const DisplayNames = (
    Intl as unknown as {
      DisplayNames?: new (
        locales: string[],
        options: { type: "region" },
      ) => { of: (code: string) => string | undefined };
    }
  ).DisplayNames;
  if (!DisplayNames) return null;
  try {
    return new DisplayNames(["zh-CN"], { type: "region" });
  } catch {
    return null;
  }
})();

function countryLabel(code: string) {
  return regionNames?.of(code.toUpperCase()) || code.toUpperCase();
}

function formatOriginCount(mode: OriginCountMode, value: number) {
  return mode === "fractional_count" ? value.toFixed(2) : Math.round(value).toString();
}

type OriginRankingProps = {
  icon: typeof Building2;
  title: string;
  rows: Array<{ id: string; label: string; detail?: string; value: number }>;
  mode: OriginCountMode;
};

function OriginRanking({ icon: Icon, title, rows, mode }: OriginRankingProps) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);
  const orderedRows = [...rows].sort(
    (left, right) => right.value - left.value || left.label.localeCompare(right.label),
  );
  return (
    <div className="min-w-0 py-3 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-[0.02em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-ink-400" />
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="py-5 text-sm text-ink-400">当前文献尚无可统计信息</p>
      ) : (
        <div className="divide-y divide-border/60">
          {orderedRows.slice(0, 6).map((row) => (
            <div key={row.id} className="flex min-w-0 items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-ink-700" title={row.label}>
                {row.label}
                {row.detail ? <span className="ml-1.5 text-[10px] text-ink-400">{row.detail}</span> : null}
              </span>
              <span className="hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-ink-100 sm:block">
                <span
                  className="block h-full rounded-full bg-primary/60 transition-[width] duration-300 motion-reduce:transition-none"
                  style={{
                    width: `${row.value > 0 && maxValue > 0 ? Math.max(6, (row.value / maxValue) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-800">
                {formatOriginCount(mode, row.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AcademicLiteratureDiscovery({
  courseId,
  topicId,
  embedded = false,
  searchResult,
}: AcademicLiteratureDiscoveryProps) {
  const literature = useLiteratureCenterClient();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AcademicLiteratureState>("all");
  const [originMode, setOriginMode] = useState<OriginCountMode>("full_count");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ownLastSearch, setOwnLastSearch] = useState<AcademicDiscoverySearchResponse | null>(null);
  const lastSearch = searchResult ?? ownLastSearch;

  const worksKey = ["courses", courseId, "literature", "academic-works", topicId ?? "all-topics", filter] as const;
  const coverageKey = ["courses", courseId, "literature", "academic-coverage", topicId ?? "all-topics"] as const;
  const originsKey = ["courses", courseId, "literature", "academic-origins", topicId ?? "all-topics"] as const;
  const worksQuery = useQuery({
    queryKey: worksKey,
    queryFn: () =>
      literature.listAcademicWorks(courseId, {
        state: filter === "all" ? undefined : filter,
        topic_id: topicId ?? undefined,
        page_size: 100,
      }),
    enabled: Boolean(courseId),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    refetchInterval: (currentQuery) => {
      const rows = currentQuery.state.data as AcademicLiteratureWork[] | undefined;
      return rows?.some((work) => ACTIVE_FULLTEXT_STATUSES.has(work.fulltext?.status ?? ""))
        ? 3_000
        : false;
    },
  });
  const coverageQuery = useQuery({
    queryKey: coverageKey,
    queryFn: () => literature.getAcademicCoverage(courseId, topicId),
    enabled: Boolean(courseId),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });
  const originsQuery = useQuery({
    queryKey: originsKey,
    queryFn: () => literature.getAcademicResearchOrigins(courseId, 10, topicId),
    enabled: Boolean(courseId),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });

  const searchMutation = useMutation({
    mutationFn: (searchQuery: string) =>
      literature.searchAcademicWorks(courseId, {
        query: searchQuery,
        max_results: 18,
        topic_id: topicId ?? undefined,
      }),
    onSuccess: async (response) => {
      setOwnLastSearch(response);
      setFilter("all");
      setExpandedId(response.works[0]?.id ?? null);
      await queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-works"],
      });
      await queryClient.invalidateQueries({ queryKey: coverageKey });
      await queryClient.invalidateQueries({ queryKey: originsKey });
      toast.success(`找到 ${response.works.length} 篇相关文献`);
    },
    onError: (error) => toast.error(getErrorMessage(error, "学术检索失败")),
  });

  const stateMutation = useMutation({
    mutationFn: ({ workId, state }: { workId: string; state: AcademicLiteratureState }) =>
      literature.updateAcademicWorkState(courseId, workId, state),
    onSuccess: async (updated) => {
      queryClient.setQueriesData<AcademicLiteratureWork[]>(
        { queryKey: ["courses", courseId, "literature", "academic-works"] },
        (current) => current?.map((work) => (work.id === updated.id ? updated : work)),
      );
      if (updated.state === "saved") {
        await queryClient.invalidateQueries({
          queryKey: ["courses", courseId, "literature", "items"],
        });
        toast.success("已收藏文献");
      }
      await queryClient.invalidateQueries({ queryKey: coverageKey });
      await queryClient.invalidateQueries({ queryKey: originsKey });
    },
    onError: (error) => toast.error(getErrorMessage(error, "更新文献状态失败")),
  });

  const fulltextMutation = useMutation({
    mutationFn: (input: { workId: string; action: "enqueue" | "cancel"; jobId?: string }) =>
      input.action === "cancel" && input.jobId
        ? literature.cancelAcademicFulltext(courseId, input.workId, input.jobId)
        : literature.enqueueAcademicFulltext(courseId, input.workId),
    onSuccess: (job) => {
      queryClient.setQueriesData<AcademicLiteratureWork[]>(
        { queryKey: ["courses", courseId, "literature", "academic-works"] },
        (current) => current?.map((work) => (work.id === job.work_id ? { ...work, fulltext: job } : work)),
      );
      if (job.status === "cancelled") {
        toast.success("已取消开放全文获取");
      } else {
        toast.success("开放全文任务已加入队列");
      }
    },
    onError: (error) => toast.error(getErrorMessage(error, "开放全文任务操作失败")),
  });

  const works = worksQuery.data ?? [];
  const visibleWorks = useMemo(() => works.filter((work) => work.state !== "ignored"), [works]);
  const providers = lastSearch?.run.provider_keys ?? [];
  const coverage = coverageQuery.data;
  const origins = originsQuery.data;
  const coveragePercent = (count: number) => {
    if (!coverage?.work_count) return 0;
    return Math.round((count / coverage.work_count) * 100);
  };
  const providerHealth = useMemo(() => {
    const trace = lastSearch?.trace_summary ?? [];
    const unavailable = Array.from(
      new Set(
        trace
          .filter((entry) => entry.provider && ["error", "join_error"].includes(entry.status))
          .map((entry) => entry.provider as string),
      ),
    );
    const recovered = Array.from(
      new Set(
        trace
          .filter((entry) => entry.provider && entry.status === "recovered")
          .map((entry) => entry.provider as string),
      ),
    ).filter((provider) => !unavailable.includes(provider));
    return { unavailable, recovered };
  }, [lastSearch]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) {
      toast.error("请输入研究主题、关键词或 DOI");
      return;
    }
    searchMutation.mutate(value);
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className={embedded ? "w-full px-4 pb-6 sm:px-6" : "mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8"}>
        {!embedded ? <section className="border-b border-border pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink-950">发现文献</h2>
              <p className="mt-1 text-sm text-ink-500">检索全球开放学术元数据，筛选后进入文献库与研究工作流。</p>
            </div>
            {lastSearch ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                <span>{lastSearch.run.discovered_count} 条结果</span>
                <span>{lastSearch.run.duplicate_count} 条已合并</span>
                {providers.length > 0 ? <span>来源：{providers.join(" / ")}</span> : null}
                {providerHealth.recovered.length > 0 ? (
                  <span title={providerHealth.recovered.join("、")}>
                    {providerHealth.recovered.length} 个来源重试后恢复
                  </span>
                ) : null}
                {providerHealth.unavailable.length > 0 ? (
                  <span title={providerHealth.unavailable.join("、")}>
                    {providerHealth.unavailable.length} 个来源暂不可用
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <form onSubmit={submitSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：污水处理微生物群落、膜污染控制、10.1016/..."
                className="h-10 pl-9"
                disabled={searchMutation.isPending}
              />
            </div>
            <Button type="submit" className="h-10 px-5" disabled={searchMutation.isPending}>
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searchMutation.isPending ? "正在检索" : "检索文献"}
            </Button>
          </form>

          {searchMutation.isPending ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-500" aria-live="polite">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              正在查询学术来源并合并 DOI、标题和版本信息
            </div>
          ) : null}
        </section> : null}

        <section className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-0.5">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === item.value
                      ? "bg-background text-ink-950 shadow-sm ring-1 ring-border"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-500">{visibleWorks.length} 篇</span>
          </div>

          {coverage && coverage.work_count > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border py-3 text-xs text-ink-500">
              <span className="mr-1 text-[11px] text-ink-400">数据完整度</span>
              {[
                ["DOI", coveragePercent(coverage.doi_count)],
                ["摘要", coveragePercent(coverage.abstract_count)],
                ["机构", coveragePercent(coverage.institution_count)],
                ["国家", coveragePercent(coverage.country_count)],
                ["开放全文", coveragePercent(coverage.open_access_count)],
              ].map(([label, value]) => (
                <span
                  key={String(label)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-ink-500"
                >
                  {label}
                  <strong className="tabular-nums font-semibold text-ink-900">{value}%</strong>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-ink-500">
                已收藏
                <strong className="tabular-nums font-semibold text-ink-900">{coverage.saved_count}</strong>
              </span>
              {coverage.risk_count > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-medium text-warning-800">
                  需关注 {coverage.risk_count}
                </span>
              ) : null}
            </div>
          ) : null}

          {origins && origins.work_count > 0 ? (
            <div className="border-b border-border py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-ink-900">研究来源</h3>
                  <p className="text-[11px] text-ink-500">
                    {origins.institution_work_count}/{origins.work_count} 篇已识别署名机构
                  </p>
                </div>
                <div className="inline-flex w-fit items-center rounded-full bg-muted/60 p-0.5" role="group" aria-label="研究来源计数口径">
                  {ORIGIN_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      title={mode.title}
                      aria-pressed={originMode === mode.value}
                      onClick={() => setOriginMode(mode.value)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        originMode === mode.value
                          ? "bg-white text-ink-900 shadow-sm"
                          : "text-ink-500 hover:text-ink-800"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-1 grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <OriginRanking
                  icon={Building2}
                  title="机构"
                  mode={originMode}
                  rows={origins.institutions.map((institution) => ({
                    id: institution.institution_id,
                    label: institution.institution_name,
                    detail: institution.country_code ? countryLabel(institution.country_code) : undefined,
                    value: institution[originMode],
                  }))}
                />
                <OriginRanking
                  icon={Globe2}
                  title="国家与地区"
                  mode={originMode}
                  rows={origins.countries.map((country) => ({
                    id: country.country_code,
                    label: countryLabel(country.country_code),
                    detail: country.country_code.toUpperCase(),
                    value: country[originMode],
                  }))}
                />
              </div>
            </div>
          ) : null}

          {worksQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-ink-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在读取文献目录
            </div>
          ) : visibleWorks.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center border-b border-dashed border-border text-center">
              <Database className="h-6 w-6 text-ink-400" />
              <p className="mt-3 text-sm font-medium text-ink-800">当前范围内还没有文献</p>
              <p className="mt-1 text-xs text-ink-500">输入研究主题、研究方向或 DOI 开始检索。</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleWorks.map((work, index) => {
                const expanded = expandedId === work.id;
                const pending = stateMutation.isPending && stateMutation.variables?.workId === work.id;
                const lifecycle = LIFECYCLE_META[work.lifecycle_status];
                const relations = work.relations ?? [];
                const fulltext = work.fulltext ?? null;
                const fulltextBusy = fulltextMutation.isPending
                  && fulltextMutation.variables?.workId === work.id;
                return (
                  <article
                    key={work.id}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-300"
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <div className="py-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : work.id)}
                          className="min-w-0 flex-1 text-left"
                          aria-expanded={expanded}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {work.is_open_access ? <Badge variant="success">开放获取</Badge> : null}
                            {lifecycle ? <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge> : null}
                            {work.state === "saved" ? <Badge variant="secondary">已收藏</Badge> : null}
                            {work.state === "shortlisted" ? <Badge variant="outline">稍后处理</Badge> : null}
                            {work.is_unread ? <Badge variant="warning">未读</Badge> : null}
                          </div>
                          <h3 className="mt-2 text-base font-semibold leading-6 text-ink-950">
                            {work.canonical_title}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-ink-500">
                            {work.authors.slice(0, 4).map((author) => author.author_name).join("、") || "作者信息待补充"}
                            {work.authors.length > 4 ? " 等" : ""}
                          </p>
                          <p className="mt-1 text-xs text-ink-500">
                            {[work.publication_title, work.publication_year].filter(Boolean).join(" · ") || "出版信息待补充"}
                            {typeof work.cited_by_count === "number" ? ` · 被引 ${work.cited_by_count}` : ""}
                          </p>
                        </button>

                        <div className="flex shrink-0 items-center gap-2 md:pt-1">
                          {work.state === "saved" ? (
                            <Button size="sm" variant="outline" disabled>
                              <Check className="h-4 w-4" />
                              已收藏
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => stateMutation.mutate({ workId: work.id, state: "saved" })}
                              disabled={pending}
                            >
                              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkCheck className="h-4 w-4" />}
                              收藏文献
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title={work.state === "shortlisted" ? "取消稍后处理" : "稍后处理"}
                            onClick={() =>
                              stateMutation.mutate({
                                workId: work.id,
                                state: work.state === "shortlisted" ? "discovered" : "shortlisted",
                              })
                            }
                            disabled={pending || work.state === "saved"}
                          >
                            {work.state === "shortlisted" ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="忽略此文献"
                            onClick={() => stateMutation.mutate({ workId: work.id, state: "ignored" })}
                            disabled={pending || work.state === "saved"}
                          >
                            <CircleOff className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={expanded ? "收起详情" : "展开详情"}
                            onClick={() => setExpandedId(expanded ? null : work.id)}
                          >
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="mt-4 grid gap-5 border-l-2 border-primary/20 pl-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                          <div>
                            <p className="text-xs font-semibold text-ink-700">摘要</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-600">
                              {work.abstract_text || "当前数据源没有提供摘要。可打开原始页面进一步核对。"}
                            </p>
                            {lifecycle || relations.length > 0 ? (
                              <div className="mt-4 border-t border-border pt-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-xs font-semibold text-ink-700">文献状态</p>
                                  {lifecycle ? (
                                    <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                                  ) : (
                                    <Badge variant="outline">版本关系</Badge>
                                  )}
                                </div>
                                {relations.length > 0 ? (
                                  <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
                                    {relations.map((relation) => {
                                      const doi = counterpartDoi(work, relation);
                                      const date = relationDate(relation.effective_at);
                                      return (
                                        <div
                                          key={relation.id}
                                          className="flex flex-col gap-1.5 py-3 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                                        >
                                          <div className="min-w-0">
                                            <p className="font-medium text-ink-700">
                                              {relationDescription(work, relation)}
                                            </p>
                                            <p className="mt-1 text-ink-500">
                                              {[sourceName(relation), date].filter(Boolean).join(" · ")}
                                            </p>
                                          </div>
                                          {doi ? (
                                            <a
                                              href={`https://doi.org/${doi}`}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex min-w-0 items-center gap-1 break-all font-medium text-primary hover:underline sm:max-w-64 sm:justify-end"
                                            >
                                              {doi}
                                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                                            </a>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs leading-5 text-ink-500">
                                    {work.lifecycle_source
                                      ? `状态来源：${work.lifecycle_source === "crossref" ? "Crossref" : "OpenAlex"}`
                                      : "数据源已将该文献标记为需关注。"}
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <dl className="space-y-3 text-xs">
                            <div>
                              <dt className="text-ink-400">主题相关性</dt>
                              <dd className="mt-1 text-ink-700">{work.relevance_reason}</dd>
                            </div>
                            {work.doi ? (
                              <div>
                                <dt className="text-ink-400">DOI</dt>
                                <dd className="mt-1 break-all text-ink-700">{work.doi}</dd>
                              </div>
                            ) : null}
                            {work.state === "saved" ? (
                              <div>
                                <dt className="text-ink-400">全文与解析</dt>
                                <dd className="mt-1.5">
                                  {fulltext ? (
                                    <div className="space-y-2">
                                      <div className="flex items-start gap-1.5 text-ink-700">
                                        {ACTIVE_FULLTEXT_STATUSES.has(fulltext.status) ? (
                                          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                                        ) : (
                                          <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                                        )}
                                        <span>{FULLTEXT_STATUS_LABELS[fulltext.status] ?? "全文任务状态更新中"}</span>
                                      </div>
                                      {fulltext.status === "failed" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          disabled={fulltextBusy}
                                          onClick={() => fulltextMutation.mutate({ workId: work.id, action: "enqueue" })}
                                        >
                                          {fulltextBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                          重试获取
                                        </Button>
                                      ) : null}
                                      {fulltext.status === "cancelled" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          disabled={fulltextBusy}
                                          onClick={() => fulltextMutation.mutate({ workId: work.id, action: "enqueue" })}
                                        >
                                          <RefreshCw className="h-3.5 w-3.5" />
                                          重新获取
                                        </Button>
                                      ) : null}
                                      {ACTIVE_FULLTEXT_STATUSES.has(fulltext.status) ? (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs text-ink-500"
                                          disabled={fulltextBusy}
                                          onClick={() => fulltextMutation.mutate({
                                            workId: work.id,
                                            action: "cancel",
                                            jobId: fulltext.id,
                                          })}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                          取消
                                        </Button>
                                      ) : null}
                                    </div>
                                  ) : work.open_access_url ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs"
                                      disabled={fulltextBusy}
                                      onClick={() => fulltextMutation.mutate({ workId: work.id, action: "enqueue" })}
                                    >
                                      {fulltextBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
                                      获取开放全文
                                    </Button>
                                  ) : (
                                    <span className="text-ink-500">未发现可自动获取的开放 PDF</span>
                                  )}
                                </dd>
                              </div>
                            ) : null}
                            {(work.institutions ?? []).length > 0 || work.authors.some((author) => author.institution_name) ? (
                              <div>
                                <dt className="text-ink-400">署名机构</dt>
                                <dd className="mt-1 text-ink-700">
                                  {(work.institutions ?? []).length > 0
                                    ? work.institutions
                                        .slice(0, 5)
                                        .map((institution) => institution.institution_name)
                                        .join("、")
                                    : Array.from(
                                        new Set(work.authors.map((author) => author.institution_name).filter(Boolean)),
                                      )
                                        .slice(0, 3)
                                        .join("、")}
                                  {(work.institutions ?? []).length > 5 ? " 等" : ""}
                                </dd>
                              </div>
                            ) : null}
                            {work.primary_url ? (
                              <div className="pt-1">
                                <a
                                  href={work.open_access_url || work.primary_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                >
                                  查看原始文献
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
