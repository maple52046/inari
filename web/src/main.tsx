import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AppProvider } from "@/components/providers/app_provider";
import { SessionProvider } from "@/app/session_context";
import { AppRoutes } from "@/app/routes";
import { basePath } from "@/api/client";
import "@/styles/fonts.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("index.html must provide a #root element to mount into");
}

createRoot(container).render(
  <StrictMode>
    {/* The prefix is injected into the document by the server, so one build
        runs under any BASE_PATH without being rebuilt. */}
    <BrowserRouter basename={basePath() || undefined}>
      <AppProvider>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
