import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/app/auth";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { LoginPage } from "@/pages/login-page";

const OverviewPage = lazy(() =>
  import("@/pages/overview-page").then((module) => ({
    default: module.OverviewPage
  }))
);
const RunsPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.RunsPage
  }))
);
const SkillsPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.SkillsPage
  }))
);
const WorkflowsPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.WorkflowsPage
  }))
);
const SchedulesPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.SchedulesPage
  }))
);
const DataPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.DataPage
  }))
);
const ApprovalsPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.ApprovalsPage
  }))
);
const SettingsPage = lazy(() =>
  import("@/pages/resource-pages").then((module) => ({
    default: module.SettingsPage
  }))
);

function RequireAuth() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex w-full max-w-md flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
        </div>
      </main>
    );
  }

  if (!auth.me?.authenticated) {
    return <Navigate replace to="/admin/login" />;
  }

  return <AppShell />;
}

function RouteFallback() {
  return (
    <main className="flex min-h-[360px] items-center justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
      </div>
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<LoginPage />} path="/admin/login" />
          <Route element={<RequireAuth />}>
            <Route element={<OverviewPage />} index path="/admin" />
            <Route element={<RunsPage />} path="/admin/runs" />
            <Route element={<RunsPage />} path="/admin/runs/:id" />
            <Route element={<SkillsPage />} path="/admin/skills" />
            <Route element={<SkillsPage />} path="/admin/skills/new" />
            <Route element={<SkillsPage />} path="/admin/skills/:id" />
            <Route element={<WorkflowsPage />} path="/admin/workflows" />
            <Route element={<WorkflowsPage />} path="/admin/workflows/:id" />
            <Route element={<SchedulesPage />} path="/admin/schedules" />
            <Route element={<SchedulesPage />} path="/admin/schedules/new" />
            <Route element={<SchedulesPage />} path="/admin/schedules/:id" />
            <Route element={<DataPage />} path="/admin/data/todos" />
            <Route element={<DataPage />} path="/admin/data/memories" />
            <Route element={<ApprovalsPage />} path="/admin/approvals" />
            <Route element={<SettingsPage />} path="/admin/settings" />
            <Route
              element={<SettingsPage diagnostics />}
              path="/admin/settings/diagnostics"
            />
            <Route element={<Navigate replace to="/admin" />} path="*" />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </AuthProvider>
  );
}
