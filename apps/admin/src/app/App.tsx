import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/app/auth";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { LoginPage } from "@/pages/login-page";
import { OverviewPage } from "@/pages/overview-page";
import {
  ApprovalsPage,
  DataPage,
  RunsPage,
  SchedulesPage,
  SettingsPage,
  SkillsPage,
  WorkflowsPage
} from "@/pages/resource-pages";

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

export function App() {
  return (
    <AuthProvider>
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
      <Toaster />
    </AuthProvider>
  );
}
