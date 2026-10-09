import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, LibraryBig, Loader2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useLiteratureReaderClient } from "../api/client";
import { useReaderI18n, type Translate } from "../i18n";
import type { LiteratureItem } from "../api/types";
import { cn, getErrorMessage } from "../lib/utils";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { EmbedPdfLiteratureViewer, type EmbedPdfAiCommentRequest, type EmbedPdfViewerState } from "./EmbedPdfLiteratureViewer";
import { LiteratureAssistantPanel, literatureRagState } from "./LiteratureAssistantPanel";
import type { PdfTextSelection } from "./pdf-selection";

export type LiteratureReadingRoomProps = {
  className?: string;
  initialItemId?: string | null;
  title?: string;
};

function authorLine(item: LiteratureItem, t: Translate) {
  return item.authors?.length ? item.authors.slice(0, 4).join(", ") : t("room.authorsFallback");
}

function percent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

/**
 * Full reading room: item shelf + PDF viewer + AI assistant.
 *
 * Requires a `LiteratureReaderProvider` (or an ancestor one) and a
 * `QueryClientProvider`. The viewer runtime is configured automatically by
 * `createHttpLiteratureReaderClient`; custom clients should also provide the
 * PDF source through their own client implementation.
 */
export function LiteratureReadingRoom({
  className,
  initialItemId,
  title,
}: LiteratureReadingRoomProps) {
  const { t, locale } = useReaderI18n();
  const roomTitle = title ?? t("room.title");
  const client = useLiteratureReaderClient();
  const queryClient = useQueryClient();
  const itemsKey = ["literature-reader", "items"] as const;
  const itemsQuery = useQuery({ queryKey: itemsKey, queryFn: () => client.listItems() });
  const items = itemsQuery.data ?? [];
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId ?? null);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  useEffect(() => {
    if (selectedItemId && items.some((item) => item.id === selectedItemId)) return;
    const firstWithFile = items.find((item) => item.file) ?? items[0];
    setSelectedItemId(firstWithFile?.id ?? null);
  }, [items, selectedItemId]);

  const [selectedText, setSelectedText] = useState("");
  const [assistQuestion, setAssistQuestion] = useState("");
  const [assistAnswer, setAssistAnswer] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [aiCommentRequest, setAiCommentRequest] = useState<EmbedPdfAiCommentRequest | null>(null);
  const [pendingAiCommentSelection, setPendingAiCommentSelection] = useState<PdfTextSelection | null>(null);
  const [viewerSyncStatus, setViewerSyncStatus] = useState<"idle" | "syncing" | "error">("idle");

  const viewerStateKey = ["literature-reader", "viewer-state", selectedItemId] as const;
  const viewerStateQuery = useQuery({
    queryKey: viewerStateKey,
    queryFn: () => client.getViewerState(selectedItemId as string),
    enabled: Boolean(selectedItemId && selectedItem?.file),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const progressTimerRef = useRef<number | null>(null);
  const viewerStateTimerRef = useRef<number | null>(null);
  const latestProgressRef = useRef<{
    itemId: string;
    progress: number;
    page: number;
    totalPages: number | null;
  } | null>(null);
  const latestViewerStateRef = useRef<{
    itemId: string;
    state: EmbedPdfViewerState;
    annotationCount: number;
    page: number | null;
    totalPages: number | null;
  } | null>(null);

  useEffect(() => () => {
    if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);
    if (viewerStateTimerRef.current) window.clearTimeout(viewerStateTimerRef.current);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => client.uploadItem({ file, title: file.name.replace(/\.pdf$/i, "") }),
    onSuccess: async (created) => {
      toast.success(t("room.uploadOk"));
      setSelectedItemId(created.id);
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (error) => toast.error(getErrorMessage(error, t("room.uploadFail"))),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => client.deleteItem(itemId),
    onSuccess: async (_result, itemId) => {
      toast.success(t("room.deleteOk"));
      if (selectedItemId === itemId) setSelectedItemId(null);
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (error) => toast.error(getErrorMessage(error, t("room.deleteFail"))),
  });

  const progressMutation = useMutation({
    mutationFn: ({ itemId, progress, page, totalPages }: {
      itemId: string;
      progress: number;
      page: number;
      totalPages: number | null;
    }) =>
      client.updateProgress(itemId, {
        progress_pct: progress,
        page_no: page,
        total_pages: totalPages,
        meta_json: { source: "pdf_reader" },
      }),
    onSuccess: (_progress, variables) => {
      queryClient.setQueryData<LiteratureItem[]>(itemsKey, (current) =>
        current?.map((item) =>
          item.id === variables.itemId
            ? {
                ...item,
                progress: {
                  progress_pct: variables.progress,
                  page_no: variables.page,
                  total_pages: variables.totalPages,
                  updated_at: new Date().toISOString(),
                },
              }
            : item));
    },
  });

  const viewerStateMutation = useMutation({
    mutationFn: ({ itemId, state, annotationCount, page, totalPages }: {
      itemId: string;
      state: EmbedPdfViewerState;
      annotationCount: number;
      page: number | null;
      totalPages: number | null;
    }) =>
      client.saveViewerState(itemId, {
        state_json: state as unknown as Record<string, unknown>,
        annotation_count: annotationCount,
        last_page_no: page,
        total_pages: totalPages,
      }),
    onMutate: () => setViewerSyncStatus("syncing"),
    onSuccess: (saved, variables) => {
      setViewerSyncStatus("idle");
      queryClient.setQueryData(viewerStateKey, saved);
      queryClient.setQueryData<LiteratureItem[]>(itemsKey, (current) =>
        current?.map((item) =>
          item.id === variables.itemId
            ? {
                ...item,
                annotation_count: saved.annotation_count,
                progress: item.progress
                  ? { ...item.progress, page_no: saved.last_page_no ?? item.progress.page_no }
                  : item.progress,
              }
            : item));
    },
    onError: () => setViewerSyncStatus("error"),
  });

  const ragImportMutation = useMutation({
    mutationFn: (itemId: string) => client.importToRag(itemId),
    onSuccess: async () => {
      toast.success(t("room.importQueued"));
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (error) => toast.error(getErrorMessage(error, t("room.importFail"))),
  });

  const assistMutation = useMutation({
    mutationFn: (payload: {
      mode: "page" | "full" | "questions" | "ask";
      question?: string;
      selectedText?: string;
      pageNo?: number;
      autoCommentSelection?: PdfTextSelection | null;
    }) =>
      client.assist(selectedItem?.id ?? "", {
        mode: payload.mode,
        question: payload.question ?? assistQuestion,
        page_no: payload.pageNo ?? selectedItem?.progress?.page_no ?? 1,
        selected_text: payload.selectedText ?? selectedText,
      }),
    onMutate: (payload) => {
      setPendingAiCommentSelection(payload.autoCommentSelection ?? null);
    },
    onSuccess: (response, payload) => {
      setAssistAnswer(response.answer);
      const targetSelection = payload.autoCommentSelection ?? pendingAiCommentSelection;
      if (targetSelection && response.answer.trim()) {
        setAiCommentRequest({
          id: `${targetSelection.pageNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          content: `${t("room.commentPrefix")}${response.answer.trim()}`,
          selection: targetSelection,
        });
      }
    },
    onError: (error) => {
      setPendingAiCommentSelection(null);
      toast.error(getErrorMessage(error, t("room.assistFail")));
    },
  });

  const scheduleProgressSave = (progress: number, meta?: Record<string, unknown>) => {
    if (!selectedItem?.id) return;
    const page = Number(meta?.page ?? selectedItem.progress?.page_no ?? 1);
    const totalPages = Number(meta?.total_pages ?? selectedItem.progress?.total_pages ?? 0) || null;
    latestProgressRef.current = { itemId: selectedItem.id, progress, page, totalPages };
    if (progressTimerRef.current) return;
    progressTimerRef.current = window.setTimeout(() => {
      progressTimerRef.current = null;
      if (latestProgressRef.current) progressMutation.mutate(latestProgressRef.current);
    }, 1800);
  };

  const scheduleViewerStateSave = (
    state: EmbedPdfViewerState,
    meta?: { annotationCount: number; page?: number | null; totalPages?: number | null },
  ) => {
    if (!selectedItem?.id) return;
    latestViewerStateRef.current = {
      itemId: selectedItem.id,
      state,
      annotationCount: meta?.annotationCount ?? 0,
      page: meta?.page ?? null,
      totalPages: meta?.totalPages ?? null,
    };
    setViewerSyncStatus("syncing");
    if (viewerStateTimerRef.current) window.clearTimeout(viewerStateTimerRef.current);
    viewerStateTimerRef.current = window.setTimeout(() => {
      viewerStateTimerRef.current = null;
      if (latestViewerStateRef.current) viewerStateMutation.mutate(latestViewerStateRef.current);
    }, 900);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ragState = literatureRagState(selectedItem, t);

  return (
    <main
      className={cn(
        "grid h-full min-h-0 grid-cols-1 overflow-hidden bg-muted/30 lg:grid-cols-[300px_minmax(0,1fr)]",
        className,
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          event.target.value = "";
        }}
      />

      <aside className="flex min-h-0 flex-col border-b border-border bg-background lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <LibraryBig className="h-4 w-4 shrink-0 text-primary" />
            <h2 className="truncate text-sm font-semibold text-foreground">{roomTitle}</h2>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("room.upload")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {itemsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("room.loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">{t("room.emptyTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("room.emptyBody")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group relative rounded-xl border px-3 py-2.5 transition-colors",
                    item.id === selectedItemId
                      ? "border-primary/35 bg-primary/6"
                      : "border-transparent hover:border-border hover:bg-muted/50",
                  )}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setAssistAnswer("");
                      setSelectedText("");
                    }}
                  >
                    <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span>{authorLine(item, t)}</span>
                      {item.file ? <span>{t("room.progress", { value: percent(item.progress?.progress_pct) })}</span> : <span>{t("room.noPdfBadge")}</span>}
                      {item.annotation_count > 0 ? <span>{t("room.annotations", { value: item.annotation_count })}</span> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("room.deleteItem")}
                    className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger-50 hover:text-danger-600 group-hover:flex"
                    onClick={() => deleteMutation.mutate(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto p-4 lg:p-5">
        {selectedItem?.file ? (
          <div className="mx-auto max-w-[1380px]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-foreground">{selectedItem.title}</h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{authorLine(selectedItem, t)}</span>
                  <span>{t("room.progress", { value: percent(selectedItem.progress?.progress_pct) })}</span>
                  <span>{t("room.annotations", { value: selectedItem.annotation_count ?? 0 })}</span>
                  {viewerSyncStatus === "syncing" ? <span className="text-info-600">{t("room.syncing")}</span> : null}
                  {viewerSyncStatus === "error" ? <span className="text-danger-600">{t("room.syncFailed")}</span> : null}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={ragImportMutation.isPending || !ragState.canImport}
                onClick={() => selectedItem && ragImportMutation.mutate(selectedItem.id)}
              >
                {ragImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
                {ragState.canImport ? t("room.import") : ragState.label}
              </Button>
            </div>

            <Progress value={percent(selectedItem.progress?.progress_pct)} className="mb-3 h-1.5 bg-ink-100" />

            {viewerStateQuery.isLoading ? (
              <div className="flex min-h-96 items-center justify-center rounded-2xl border border-border bg-background text-sm font-medium text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-info-600" />
                {t("room.syncingState")}
              </div>
            ) : (
              <EmbedPdfLiteratureViewer
                key={`${selectedItem.id}:${locale}`}
                url={client.fileUrl(selectedItem.id)}
                title={selectedItem.title}
                fileName={selectedItem.file.file_name}
                initialPage={selectedItem.progress?.page_no ?? 1}
                initialViewerState={viewerStateQuery.data?.state_json as EmbedPdfViewerState | undefined}
                onTextSelection={(selection) => {
                  if (selection) setSelectedText(selection.text);
                }}
                onSelectionAiAction={(action, selection) => {
                  setAssistantOpen(true);
                  if (action === "explain") {
                    assistMutation.mutate({
                      mode: "ask",
                      question: t("room.explainPrompt"),
                      selectedText: selection.text,
                      pageNo: selection.pageNumber,
                      autoCommentSelection: selection,
                    });
                  } else {
                    setAssistQuestion(`${t("room.askPromptPrefix")}${selection.text}`);
                  }
                }}
                onProgress={(progress, meta) => scheduleProgressSave(progress, meta)}
                onViewerStateChange={(state, meta) => scheduleViewerStateSave(state, meta)}
                aiCommentRequest={aiCommentRequest}
                onAiCommentCreated={(_, result) => {
                  setPendingAiCommentSelection(null);
                  if (result.ok) toast.success(t("room.commentOk"));
                  else toast.error(result.error || t("room.commentFail"));
                }}
                assistantOpen={assistantOpen}
                onAssistantOpenChange={setAssistantOpen}
                assistantPanel={
                  <LiteratureAssistantPanel
                    item={selectedItem}
                    assistQuestion={assistQuestion}
                    assistAnswer={assistAnswer}
                    assistPending={assistMutation.isPending}
                    onAssistQuestionChange={setAssistQuestion}
                    onAssist={(mode) => assistMutation.mutate({ mode })}
                    selectedText={selectedText}
                    onSelectedTextChange={setSelectedText}
                  />
                }
              />
            )}
          </div>
        ) : selectedItem ? (
          <div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("room.noPdfTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("room.noPdfBody")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center">
            <div>
              <LibraryBig className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-3 text-sm font-semibold text-foreground">{t("room.selectTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("room.selectBody")}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
