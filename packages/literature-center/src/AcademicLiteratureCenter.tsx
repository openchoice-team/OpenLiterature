import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  BookOpen,
  CheckCheck,
  Clock3,
  FileText,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useLiteratureCenterClient } from "./api/client";
import type {
  AcademicDiscoverySearchResponse,
  AcademicLiteratureTopic,
} from "./api/types";
import { cn, getErrorMessage } from "./lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { AcademicLiteratureDiscovery } from "./AcademicLiteratureDiscovery";

const MAP_CHUNK_RELOAD_KEY = "bioedu:academic-map-chunk-reload";

const AcademicIntelligenceMap = lazy(async () => {
  try {
    const module = await import("./AcademicIntelligenceMap");
    try {
      window.sessionStorage.removeItem(MAP_CHUNK_RELOAD_KEY);
    } catch {
      // Storage can be unavailable in private browsing; the module still works.
    }
    return { default: module.AcademicIntelligenceMap };
  } catch (error) {
    // A long-lived tab may still reference a removed hashed chunk after deploy.
    // Reload once so it picks up the current index instead of showing a blank map.
    try {
      if (!window.sessionStorage.getItem(MAP_CHUNK_RELOAD_KEY)) {
        window.sessionStorage.setItem(MAP_CHUNK_RELOAD_KEY, "1");
        window.location.reload();
      }
    } catch {
      // Let Suspense/ErrorBoundary handle the failure when reload is unavailable.
    }
    throw error;
  }
});

type LiteratureCenterView = "list" | "map";

type TopicDraft = {
  name: string;
  queryText: string;
  description: string;
  autoRefresh: boolean;
};

type AcademicLiteratureCenterProps = {
  courseId: string;
  onOpenReader: (itemId: string) => void;
};

const EMPTY_TOPIC_DRAFT: TopicDraft = {
  name: "",
  queryText: "",
  description: "",
  autoRefresh: true,
};

function formatTopicTime(value?: string | null) {
  if (!value) return "尚未运行";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未运行";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function topicStatusLabel(topic: AcademicLiteratureTopic) {
  if (topic.last_run_status === "running") return "正在更新";
  if (topic.last_run_status === "failed") return "更新失败";
  if (topic.last_run_new_count > 0) return `新增 ${topic.last_run_new_count}`;
  if (topic.last_success_at) return "已同步";
  return "待检索";
}

export function AcademicLiteratureCenter({
  courseId,
  onOpenReader,
}: AcademicLiteratureCenterProps) {
  const literature = useLiteratureCenterClient();
  const queryClient = useQueryClient();
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [view, setView] = useState<LiteratureCenterView>("list");
  const [quickTopic, setQuickTopic] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState<TopicDraft>(EMPTY_TOPIC_DRAFT);
  const [deleteTopicId, setDeleteTopicId] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<AcademicDiscoverySearchResponse | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const observedTopicSuccessRef = useRef<Record<string, string | null>>({});

  const topicsKey = ["courses", courseId, "literature", "academic-topics"] as const;
  const topicsQuery = useQuery({
    queryKey: topicsKey,
    queryFn: () => literature.listAcademicTopics(courseId),
    enabled: Boolean(courseId),
    staleTime: 15_000,
    refetchInterval: (query) => {
      const topics = query.state.data as AcademicLiteratureTopic[] | undefined;
      return topics?.some((topic) => topic.last_run_status === "running") ? 3_000 : 60_000;
    },
  });

  const topics = topicsQuery.data ?? [];
  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId) ?? null,
    [selectedTopicId, topics],
  );
  const deleteTopic = useMemo(
    () => topics.find((topic) => topic.id === deleteTopicId) ?? null,
    [deleteTopicId, topics],
  );

  useEffect(() => {
    if (topics.length === 0) {
      setSelectedTopicId(null);
      return;
    }
    if (!selectedTopicId || !topics.some((topic) => topic.id === selectedTopicId)) {
      setSelectedTopicId(topics[0].id);
    }
  }, [selectedTopicId, topics]);

  const invalidateTopicViews = async (topicId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: topicsKey }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-works"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-coverage"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-origins"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-intelligence-map"],
      }),
    ]);
    if (topicId) setSelectedTopicId(topicId);
  };

  useEffect(() => {
    if (!selectedTopic) return;
    const currentSuccess = selectedTopic.last_success_at ?? null;
    const previousSuccess = observedTopicSuccessRef.current[selectedTopic.id];
    observedTopicSuccessRef.current[selectedTopic.id] = currentSuccess;

    // The topic list is polled independently. When a scheduled run completes,
    // refresh every topic-scoped view and surface the same spatial response as a manual search.
    if (previousSuccess === undefined || previousSuccess === currentSuccess || !currentSuccess) return;
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-works"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-coverage"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-origins"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["courses", courseId, "literature", "academic-intelligence-map"],
      }),
    ]);
    setPulseKey(`scheduled:${selectedTopic.id}:${currentSuccess}`);
  }, [courseId, queryClient, selectedTopic]);

  const refreshMutation = useMutation({
    mutationFn: (topicId: string) => literature.refreshAcademicTopic(courseId, topicId),
    onSuccess: async (response, topicId) => {
      setLastSearch(response);
      setPulseKey(response.run.id);
      await invalidateTopicViews(topicId);
      toast.success(`主题已更新，本次匹配 ${response.works.length} 篇文献`);
    },
    onError: (error) => toast.error(getErrorMessage(error, "主题检索失败")),
  });

  const createMutation = useMutation({
    mutationFn: (draft: TopicDraft) => literature.createAcademicTopic(courseId, {
      name: draft.name.trim(),
      query_text: draft.queryText.trim(),
      description: draft.description.trim(),
      auto_refresh: draft.autoRefresh,
    }),
    onSuccess: async (topic) => {
      setEditorOpen(false);
      setEditingTopicId(null);
      setTopicDraft(EMPTY_TOPIC_DRAFT);
      setQuickTopic("");
      await invalidateTopicViews(topic.id);
      refreshMutation.mutate(topic.id);
    },
    onError: (error) => toast.error(getErrorMessage(error, "创建主题失败")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ topicId, draft }: { topicId: string; draft: TopicDraft }) =>
      literature.updateAcademicTopic(courseId, topicId, {
        name: draft.name.trim(),
        query_text: draft.queryText.trim(),
        description: draft.description.trim(),
        auto_refresh: draft.autoRefresh,
      }),
    onSuccess: async (topic, variables) => {
      const previousQuery = topics.find((candidate) => candidate.id === variables.topicId)?.query_text.trim();
      const queryChanged = previousQuery !== variables.draft.queryText.trim();
      setEditorOpen(false);
      setEditingTopicId(null);
      await invalidateTopicViews(topic.id);
      if (queryChanged) {
        refreshMutation.mutate(topic.id);
      } else {
        toast.success("主题已更新");
      }
    },
    onError: (error) => toast.error(getErrorMessage(error, "更新主题失败")),
  });

  const deleteMutation = useMutation({
    mutationFn: (topicId: string) => literature.deleteAcademicTopic(courseId, topicId),
    onSuccess: async (_, topicId) => {
      setDeleteTopicId(null);
      if (selectedTopicId === topicId) setSelectedTopicId(null);
      await invalidateTopicViews();
      toast.success("主题已删除，已收藏的文献不受影响");
    },
    onError: (error) => toast.error(getErrorMessage(error, "删除主题失败")),
  });

  const markReadMutation = useMutation({
    mutationFn: (topicId: string) => literature.markAcademicTopicRead(courseId, topicId),
    onSuccess: async (topic) => {
      await invalidateTopicViews(topic.id);
      toast.success("已将该主题的文献标记为已读");
    },
    onError: (error) => toast.error(getErrorMessage(error, "标记已读失败")),
  });

  const toggleAutoRefresh = (topic: AcademicLiteratureTopic) => {
    updateMutation.mutate({
      topicId: topic.id,
      draft: {
        name: topic.name,
        queryText: topic.query_text,
        description: topic.description,
        autoRefresh: !topic.auto_refresh,
      },
    });
  };

  const openCreateEditor = (seed = "") => {
    setEditingTopicId(null);
    setTopicDraft({
      ...EMPTY_TOPIC_DRAFT,
      name: seed,
      queryText: seed,
    });
    setEditorOpen(true);
  };

  const openEditEditor = (topic: AcademicLiteratureTopic) => {
    setEditingTopicId(topic.id);
    setTopicDraft({
      name: topic.name,
      queryText: topic.query_text,
      description: topic.description,
      autoRefresh: topic.auto_refresh,
    });
    setEditorOpen(true);
  };

  const submitQuickTopic = (event: FormEvent) => {
    event.preventDefault();
    const value = quickTopic.trim();
    if (!value) {
      toast.error("请输入研究主题");
      return;
    }
    const existing = topics.find(
      (topic) => topic.name.toLocaleLowerCase() === value.toLocaleLowerCase()
        || topic.query_text.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
    if (existing) {
      setSelectedTopicId(existing.id);
      refreshMutation.mutate(existing.id);
      setQuickTopic("");
      return;
    }
    openCreateEditor(value);
  };

  const submitTopicEditor = (event: FormEvent) => {
    event.preventDefault();
    if (!topicDraft.name.trim() || !topicDraft.queryText.trim()) {
      toast.error("请填写主题名称和检索式");
      return;
    }
    if (editingTopicId) {
      updateMutation.mutate({ topicId: editingTopicId, draft: topicDraft });
    } else {
      createMutation.mutate(topicDraft);
    }
  };

  const topicPending = createMutation.isPending || updateMutation.isPending;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-border bg-[#f6f7fb] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Radar className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">研究主题</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => openCreateEditor()}
            aria-label="新建研究主题"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto p-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          {topicsQuery.isLoading ? (
            <div className="flex min-h-24 w-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              读取主题
            </div>
          ) : topics.length === 0 ? (
            <div className="min-w-60 px-2 py-5 text-sm text-muted-foreground lg:min-w-0">
              暂无研究主题
            </div>
          ) : topics.map((topic) => {
            const active = topic.id === selectedTopicId;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setSelectedTopicId(topic.id)}
                className={cn(
                  "group relative min-w-64 cursor-pointer overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all duration-200 motion-reduce:transition-none lg:min-w-0",
                  active
                    ? "border-primary/25 bg-white shadow-[0_12px_30px_-24px_rgba(37,99,235,0.6)] before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-full before:bg-primary"
                    : "border-transparent hover:border-border hover:bg-white/80",
                )}
                aria-pressed={active}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{topic.name}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{topic.query_text}</span>
                  </span>
                  {topic.unread_count > 0 ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-warning-100 px-1.5 text-[10px] font-bold text-warning-800">
                      {topic.unread_count > 99 ? "99+" : topic.unread_count}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{topic.work_count} 篇</span>
                  <span className={cn(topic.last_run_status === "failed" && "text-destructive")}>
                    {topicStatusLabel(topic)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {selectedTopic ? (
          <div className="hidden border-t border-border p-3 lg:block">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1 justify-start"
                onClick={() => openEditEditor(selectedTopic)}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteTopicId(selectedTopic.id)}
                aria-label={`删除主题${selectedTopic.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-background px-4 py-3.5 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <form onSubmit={submitQuickTopic} className="flex min-w-0 flex-1 gap-2 xl:max-w-2xl">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">检索或新建研究主题</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={quickTopic}
                  onChange={(event) => setQuickTopic(event.target.value)}
                  placeholder="输入主题，例如：comammox 硝化菌耐盐机制"
                  className="h-10 pl-9"
                />
              </label>
              <Button type="submit" className="h-10 px-4" disabled={refreshMutation.isPending}>
                {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                检索主题
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-10 items-center rounded-md bg-muted/70 p-1" role="group" aria-label="文献中心视图">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-2 rounded px-3 text-xs font-semibold transition-colors",
                    view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={view === "list"}
                >
                  <FileText className="h-3.5 w-3.5" />
                  文献列表
                </button>
                <button
                  type="button"
                  onClick={() => setView("map")}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-2 rounded px-3 text-xs font-semibold transition-colors",
                    view === "map" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={view === "map"}
                >
                  <Globe2 className="h-3.5 w-3.5" />
                  全球分布
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => openCreateEditor()}>
                <Plus className="h-4 w-4" />
                新建主题
              </Button>
            </div>
          </div>

          {selectedTopic ? (
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-foreground">{selectedTopic.name}</h3>
                  {selectedTopic.unread_count > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-semibold text-warning-800">
                      <BellRing className="h-3 w-3" />
                      {selectedTopic.unread_count} 篇未读
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleAutoRefresh(selectedTopic)}
                    className={cn(
                      "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                      selectedTopic.auto_refresh
                        ? "border-primary/20 bg-primary/8 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={selectedTopic.auto_refresh}
                  >
                    <Clock3 className="h-3 w-3" />
                    {selectedTopic.auto_refresh ? "每小时自动更新" : "自动更新已关闭"}
                  </button>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  检索式：{selectedTopic.query_text} · 最近更新 {formatTopicTime(selectedTopic.last_success_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedTopic.unread_count > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => markReadMutation.mutate(selectedTopic.id)}
                    disabled={markReadMutation.isPending}
                  >
                    <CheckCheck className="h-4 w-4" />
                    全部已读
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refreshMutation.mutate(selectedTopic.id)}
                  disabled={refreshMutation.isPending || selectedTopic.last_run_status === "running"}
                >
                  <RefreshCw className={cn("h-4 w-4", refreshMutation.isPending && "animate-spin")} />
                  立即更新
                </Button>
              </div>
            </div>
          ) : null}
        </header>

        {!selectedTopic && view === "list" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="max-w-md text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/8 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">创建第一个研究主题</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                文献将按主题归档，后续可独立更新、查看全球分布和识别未读文献。
              </p>
              <Button className="mt-5" onClick={() => openCreateEditor()}>
                <Plus className="h-4 w-4" />
                新建主题
              </Button>
            </div>
          </div>
        ) : view === "list" ? (
          <AcademicLiteratureDiscovery
            courseId={courseId}
            topicId={selectedTopic?.id ?? null}
            embedded
            searchResult={lastSearch}
          />
        ) : (
          <div className="min-h-0 flex-1">
            <Suspense
              fallback={(
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在绘制主题分布
                </div>
              )}
            >
              <AcademicIntelligenceMap
                courseId={courseId}
                topicId={selectedTopic?.id ?? null}
                pulseKey={pulseKey}
                embedded
                onOpenDiscovery={() => setView("list")}
                onOpenReader={onOpenReader}
              />
            </Suspense>
          </div>
        )}
      </section>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTopicId ? "编辑研究主题" : "新建研究主题"}</DialogTitle>
            <DialogDescription>
              主题名称用于整理，检索式用于学术来源查询。修改后需要手动更新一次以获取新结果。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTopicEditor} className="mt-5 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              主题名称
              <Input
                value={topicDraft.name}
                onChange={(event) => setTopicDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：硝化菌耐盐机制"
                maxLength={120}
                autoFocus
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              检索式
              <Input
                value={topicDraft.queryText}
                onChange={(event) => setTopicDraft((current) => ({ ...current, queryText: event.target.value }))}
                placeholder="支持主题词、英文关键词或 DOI"
                maxLength={500}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              备注（可选）
              <textarea
                value={topicDraft.description}
                onChange={(event) => setTopicDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                placeholder="记录筛选边界或用途"
                maxLength={500}
              />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium text-foreground">每小时自动更新</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">新发现会保留在该主题并标记为未读</span>
              </span>
              <input
                type="checkbox"
                checked={topicDraft.autoRefresh}
                onChange={(event) => setTopicDraft((current) => ({ ...current, autoRefresh: event.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={topicPending}>
                {topicPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingTopicId ? "保存修改" : "创建并检索"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTopic)} onOpenChange={(open) => !open && setDeleteTopicId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除“{deleteTopic?.name}”</DialogTitle>
            <DialogDescription>
              将删除主题、订阅和未读状态。已经收藏的文献不会被删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTopicId(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteTopic && deleteMutation.mutate(deleteTopic.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除主题
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
