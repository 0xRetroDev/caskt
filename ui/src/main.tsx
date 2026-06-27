import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { InventoryPage } from "./pages/InventoryPage";
import { StoragePage } from "./pages/StoragePage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { ValuePage } from "./pages/ValuePage";
import { CsfloatPage } from "./pages/CsfloatPage";
import { HelpPage } from "./pages/HelpPage";
import { Logo } from "./components/Logo";
import { useStatus } from "./api/hooks";
import { CurrencyProvider } from "./lib/currency";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <InventoryPage /> },
      { path: "/storage", element: <StoragePage /> },
      { path: "/schedules", element: <SchedulesPage /> },
      { path: "/value", element: <ValuePage /> },
      { path: "/csfloat", element: <CsfloatPage /> },
      { path: "/help", element: <HelpPage /> },
    ],
  },
]);

function Splash({ label, spin = true }: { label: string; spin?: boolean }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-ink-900 text-fg-dim">
      <Logo size={40} animated />
      {spin && <Loader2 size={18} className="animate-spin" />}
      <p className="text-sm">{label}</p>
    </div>
  );
}

function Root() {
  const status = useStatus();
  if (status.isLoading) return <Splash label="Starting" />;
  if (status.isError) return <Splash label="Can't reach the backend. Start it, then refresh." spin={false} />;
  if (status.data?.restoring && !status.data.authenticated) return <Splash label="Restoring your session" />;
  if (!status.data?.authenticated) return <LoginPage />;
  if (!status.data.connected) return <Splash label="Connecting to Steam" />;
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <Root />
      </CurrencyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
