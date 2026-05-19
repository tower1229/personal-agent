import { createMiddleware } from "hono/factory";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";

const adminUiCookieName = "admin_ui_session";

function adminUiSessionValue(): string {
  return createHash("sha256")
    .update(`admin-ui:${env.ADMIN_TOKEN}`)
    .digest("hex");
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  const cookie = cookies.find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export const adminAuth = createMiddleware(async (c, next) => {
  const authorization = c.req.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const url = new URL(c.req.url);
  const isAdminUi = url.pathname.startsWith("/admin/ui");
  const queryToken = isAdminUi ? url.searchParams.get("token") : null;
  const cookieSession = isAdminUi
    ? getCookieValue(c.req.header("cookie") ?? "", adminUiCookieName)
    : null;
  const expectedSession = adminUiSessionValue();
  const bearerToken = match?.[1];
  const token = bearerToken ?? queryToken;

  if (token !== env.ADMIN_TOKEN) {
    if (isAdminUi && cookieSession === expectedSession) {
      await next();
      return;
    }

    return c.json({ error: "Unauthorized" }, 401);
  }

  if (isAdminUi && queryToken) {
    url.searchParams.delete("token");
    c.header(
      "Set-Cookie",
      `${adminUiCookieName}=${expectedSession}; Path=/admin/ui; HttpOnly; SameSite=Lax; Max-Age=28800`
    );

    return c.redirect(`${url.pathname}${url.search}`);
  }

  await next();
});
