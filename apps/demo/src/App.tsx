import { useState } from "react";
import { BookOpenCheck, Globe2 } from "lucide-react";
import { toast } from "sonner";

import { AcademicLiteratureCenter, LiteratureCenterProvider } from "@opendhu/literature-center";

import ReaderTab from "./ReaderTab";
import { createMockLiteratureCenterClient } from "./mockClient";
import { cn } from "./lib";

const centerClient = createMockLiteratureCenterClient();

export default function App() {
  const [tab, setTab] = useState<"center" | "reader">("center");
  const [locale, setLocale] = useState(
    () => localStorage.getItem("opendhu.locale") ?? "zh-CN",
  );
  const toggleLocale = () => {
    const next = locale.startsWith("zh") ? "en-US" : "zh-CN";
    setLocale(next);
    localStorage.setItem("opendhu.locale", next);
  };
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-base font-semibold tracking-tight">OpenChoice</span>
            <span className="text-sm text-muted-foreground">Literature Suite</span>
          </div>
          <nav className="flex items-center gap-1 rounded-lg bg-muted/70 p-1" aria-label="模块切换">
            <button
              type="button"
              onClick={() => setTab("center")}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                tab === "center" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Globe2 className="h-3.5 w-3.5" />
              文献中心
            </button>
            <button
              type="button"
              onClick={() => setTab("reader")}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                tab === "reader" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BookOpenCheck className="h-3.5 w-3.5" />
              研读室
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-ink-50 px-3 py-1 text-xs text-muted-foreground">
            {tab === "center" ? "mock data" : "reader api"}
          </span>
          <button
            type="button"
            onClick={toggleLocale}
            className="flex h-7 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            aria-label="Switch language"
          >
            {locale.startsWith("zh") ? "EN" : "中文"}
          </button>
        </div>
      </header>
      {tab === "center" ? (
        <LiteratureCenterProvider client={centerClient}>
          <AcademicLiteratureCenter
            courseId="demo-course"
            onOpenReader={(itemId) => {
              toast.info("onOpenReader", { description: `literature item: ${itemId}` });
            }}
          />
        </LiteratureCenterProvider>
      ) : (
        <ReaderTab locale={locale} />
      )}
    </div>
  );
}
