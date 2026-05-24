import { Navigate } from "react-router-dom";
import { TelegramLogin } from "@/components/telegram-login";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/app/auth";

export function LoginPage() {
  const auth = useAuth();

  if (auth.me?.authenticated) {
    return <Navigate replace to="/admin" />;
  }

  return (
    <main className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pt-8 md:pt-16">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
            Personal Agent
          </p>
          <h1 className="text-4xl font-semibold tracking-normal">
            Admin Console
          </h1>
        </div>

        <section className="w-full max-w-xl">
          {auth.loading ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-64" />
            </div>
          ) : (
            <TelegramLogin config={auth.authConfig} />
          )}
        </section>

        {auth.error ? (
          <p className="text-sm text-destructive">{auth.error}</p>
        ) : null}
      </div>
    </main>
  );
}
