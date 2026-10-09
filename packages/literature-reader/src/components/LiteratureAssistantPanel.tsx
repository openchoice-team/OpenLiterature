import { BookOpen, GraduationCap, Loader2, MessageSquareText, Sparkles } from "lucide-react";

import type { LiteratureItem } from "../api/types";
import { translate, useReaderI18n, type Translate } from "../i18n";
import { RagMarkdown } from "./RagMarkdown";

export type LiteratureRagState = {
  label: string;
  tone: "outline" | "success" | "secondary" | "danger" | "default";
  helper: string;
  canImport: boolean;
};

export function literatureRagState(
  item?: LiteratureItem | null,
  t: Translate = translate,
): LiteratureRagState {
  if (!item?.personal_rag_enabled) {
    return {
      label: t("rag.notImported.label"),
      tone: "outline",
      helper: t("rag.notImported.help"),
      canImport: true,
    };
  }
  switch (item.ingestion_status) {
    case "ready":
      return {
        label: t("rag.ready.label"),
        tone: "success",
        helper: t("rag.ready.help"),
        canImport: false,
      };
    case "queued":
      return {
        label: t("rag.queued.label"),
        tone: "secondary",
        helper: t("rag.queued.help"),
        canImport: false,
      };
    case "processing":
      return {
        label: t("rag.processing.label"),
        tone: "secondary",
        helper: t("rag.processing.help"),
        canImport: false,
      };
    case "failed":
      return {
        label: t("rag.failed.label"),
        tone: "danger",
        helper: t("rag.failed.help"),
        canImport: true,
      };
    default:
      return {
        label: t("rag.default.label"),
        tone: "default",
        helper: t("rag.default.help"),
        canImport: false,
      };
  }
}

function readerAssistantStatusClass(tone: LiteratureRagState["tone"]) {
  if (tone === "success") return "bioedu-reader-assistant__status bioedu-reader-assistant__status--success";
  if (tone === "danger") return "bioedu-reader-assistant__status bioedu-reader-assistant__status--danger";
  if (tone === "secondary") {
    return "bioedu-reader-assistant__status bioedu-reader-assistant__status--secondary";
  }
  return "bioedu-reader-assistant__status";
}

function AssistButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Sparkles;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="bioedu-reader-assistant__quick" onClick={onClick} disabled={disabled}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

export type LiteratureAssistantPanelProps = {
  item: LiteratureItem | null;
  assistQuestion: string;
  assistAnswer: string;
  assistPending: boolean;
  onAssistQuestionChange: (value: string) => void;
  onAssist: (mode: "page" | "full" | "questions" | "ask") => void;
  selectedText: string;
  onSelectedTextChange: (value: string) => void;
};

/**
 * AI reading assistant. Rendered inside the PDF viewer shadow root through
 * the `assistantPanel` portal slot; the `bioedu-reader-assistant__*` classes
 * are styled by the bundled EmbedPDF runtime. All copy goes through the
 * reader i18n layer (`ReaderI18nProvider`).
 */
export function LiteratureAssistantPanel({
  item,
  assistQuestion,
  assistAnswer,
  assistPending,
  onAssistQuestionChange,
  onAssist,
  selectedText,
  onSelectedTextChange,
}: LiteratureAssistantPanelProps) {
  const { t } = useReaderI18n();
  const ragState = literatureRagState(item, t);
  return (
    <div className="bioedu-reader-assistant">
      <div className="bioedu-reader-assistant__header">
        <div className="bioedu-reader-assistant__title-row">
          <div>
            <p className="bioedu-reader-assistant__title">{item?.title ?? t("assistant.noItem")}</p>
            <p className="bioedu-reader-assistant__hint">{ragState.helper}</p>
          </div>
          <span className={readerAssistantStatusClass(ragState.tone)}>{ragState.label}</span>
        </div>
      </div>

      <div className="bioedu-reader-assistant__scroll" role="tabpanel">
        <div className="bioedu-reader-assistant__stack">
          <div className="bioedu-reader-assistant__quick-grid">
            <AssistButton
              icon={Sparkles}
              label={t("assistant.quickPage")}
              onClick={() => onAssist("page")}
              disabled={!item || assistPending}
            />
            <AssistButton
              icon={BookOpen}
              label={t("assistant.quickFull")}
              onClick={() => onAssist("full")}
              disabled={!item || assistPending}
            />
            <AssistButton
              icon={GraduationCap}
              label={t("assistant.quickQuestions")}
              onClick={() => onAssist("questions")}
              disabled={!item || assistPending}
            />
          </div>
          {selectedText ? (
            <div className="bioedu-reader-assistant__quote">
              <div className="bioedu-reader-assistant__quote-head">
                <span>{t("assistant.selected")}</span>
                <button
                  type="button"
                  onClick={() => onSelectedTextChange("")}
                  className="bioedu-reader-assistant__text-button"
                >
                  {t("assistant.clear")}
                </button>
              </div>
              <p className="bioedu-reader-assistant__selected-text">{selectedText}</p>
            </div>
          ) : null}
          <textarea
            value={assistQuestion}
            onChange={(event) => onAssistQuestionChange(event.target.value)}
            placeholder={t("assistant.placeholder")}
            className="bioedu-reader-assistant__textarea"
          />
          <button
            type="button"
            className="bioedu-reader-assistant__button bioedu-reader-assistant__button--primary"
            disabled={!item || assistPending}
            onClick={() => onAssist("ask")}
          >
            {assistPending ? <Loader2 className="bioedu-reader-assistant__spin" /> : <MessageSquareText />}
            {t("assistant.send")}
          </button>
          <div className="bioedu-reader-assistant__divider" />
          <div className="bioedu-reader-assistant__answer">
            {assistPending ? (
              <p>{t("assistant.pending")}</p>
            ) : assistAnswer ? (
              <RagMarkdown content={assistAnswer} compact />
            ) : (
              <>
                <p><strong>{t("assistant.suggestTitle")}</strong></p>
                <p>{t("assistant.suggestBody")}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
