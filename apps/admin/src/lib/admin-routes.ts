export function isCreateRoutePath(pathname: string): boolean {
  return pathname.split("?")[0]?.endsWith("/new") ?? false;
}
