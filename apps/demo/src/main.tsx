import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { LiteratureCenterProvider } from "@opendhu/literature-center";

import App from "./App";
import { createMockLiteratureCenterClient } from "./mockClient";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

const client = createMockLiteratureCenterClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiteratureCenterProvider client={client}>
        <App />
        <Toaster position="top-center" richColors />
      </LiteratureCenterProvider>
    </QueryClientProvider>
  </StrictMode>,
);
