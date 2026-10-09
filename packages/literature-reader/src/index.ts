export {
  LiteratureReaderProvider,
  useLiteratureReaderClient,
  createHttpLiteratureReaderClient,
} from "./api/client";
export type {
  LiteratureReaderClient,
  HttpLiteratureReaderClientOptions,
  UploadLiteratureItemPayload,
  UpdateProgressPayload,
  UpsertViewerStatePayload,
  AssistMode,
  AssistPayload,
  KnowledgeAskPayload,
  KnowledgeComparePayload,
} from "./api/client";
export { configureReaderRuntime, getReaderRuntime } from "./api/runtime";
export type { ReaderRuntime } from "./api/runtime";
export {
  ReaderI18nProvider,
  useReaderI18n,
  registerReaderMessages,
  setReaderLocale,
  getReaderLocale,
  normalizeLocale,
  translate,
  translateWith,
} from "./i18n";
export type { Translate, ReaderMessages } from "./i18n";
export { enUS, zhCN } from "./i18n/messages";
export { LiteratureReadingRoom } from "./components/LiteratureReadingRoom";
export type { LiteratureReadingRoomProps } from "./components/LiteratureReadingRoom";
export {
  LiteratureAssistantPanel,
  literatureRagState,
} from "./components/LiteratureAssistantPanel";
export type {
  LiteratureAssistantPanelProps,
  LiteratureRagState,
} from "./components/LiteratureAssistantPanel";
export { EmbedPdfLiteratureViewer } from "./components/EmbedPdfLiteratureViewer";
export type {
  EmbedPdfViewerState,
  EmbedPdfAiCommentRequest,
} from "./components/EmbedPdfLiteratureViewer";
export type { PdfTextSelection, PdfSelectionRect, PdfViewportRect } from "./components/pdf-selection";
export * from "./api/types";
