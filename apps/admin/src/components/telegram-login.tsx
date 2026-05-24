import { useEffect, useRef } from "react";
import type { AdminAuthConfigResponse } from "@personal-agent/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TelegramLogin(props: {
  config: AdminAuthConfigResponse | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const host = window.location.hostname;
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");

  useEffect(() => {
    if (!props.config?.botUsername || !containerRef.current || isLocalHost) {
      return;
    }

    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = props.config.botUsername;
    script.dataset.size = "large";
    script.dataset.authUrl = `${window.location.origin}/auth/telegram/callback`;
    script.dataset.lang = "zh-hans";
    script.dataset.requestAccess = "write";
    containerRef.current.append(script);
  }, [props.config, isLocalHost]);

  if (props.config && !props.config.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Telegram 登录未配置</CardTitle>
          <CardDescription>
            配置 TELEGRAM_BOT_USERNAME 后会显示官方登录按钮。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (props.config?.configured && isLocalHost) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>需要线上域名</CardTitle>
          <CardDescription>
            Telegram Login 不能在 localhost 或 127.0.0.1 完成域名校验。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          部署到 workers.dev 后，在 BotFather 执行 /setdomain 绑定 Admin 域名。
        </CardContent>
      </Card>
    );
  }

  return <div ref={containerRef} />;
}
