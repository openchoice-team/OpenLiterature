import { useState } from "react";
import { LiteratureReadingRoom, LiteratureReaderProvider, ReaderI18nProvider } from "@opendhu/literature-reader";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { devLogin, getReaderToken, READER_API_BASE, readerClient } from "./reader";

export default function ReaderTab({ locale }: { locale: string }) {
  const [loggedIn, setLoggedIn] = useState(Boolean(getReaderToken()));
  const [name, setName] = useState("demo");
  const [pending, setPending] = useState(false);
  const isZh = locale.startsWith("zh");

  const copy = isZh
    ? {
        title: "进入文献研读室",
        body: "演示用开发登录（无密码）。后端地址：",
        name: "用户名",
        submit: "进入研读室",
        welcome: (user: string) => `欢迎，${user}`,
        fail: "登录失败",
      }
    : {
        title: "Enter the Reading Room",
        body: "Demo dev-login (no password). API: ",
        name: "Username",
        submit: "Enter",
        welcome: (user: string) => `Welcome, ${user}`,
        fail: "Login failed",
      };

  const content = loggedIn ? (
    <LiteratureReaderProvider client={readerClient}>
      <LiteratureReadingRoom />
    </LiteratureReaderProvider>
  ) : (
    <div className="flex h-full items-center justify-center bg-muted/30 p-6">
      <form
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)]"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            const user = await devLogin(name.trim() || "demo");
            toast.success(copy.welcome(user.name));
            setLoggedIn(true);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : copy.fail);
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {copy.body}
          {READER_API_BASE}
        </p>
        <label className="mt-4 block space-y-1.5 text-sm font-medium text-foreground">
          {copy.name}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/10"
            placeholder="demo"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-92 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {copy.submit}
        </button>
      </form>
    </div>
  );

  return <ReaderI18nProvider locale={locale}>{content}</ReaderI18nProvider>;
}
