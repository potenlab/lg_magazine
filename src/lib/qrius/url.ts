import type { QriusConfig } from "./config";

export function safeRelativeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function redirectUrlForApp(path: string, cfg: QriusConfig): URL {
  return new URL(safeRelativeRedirect(path), cfg.publicOrigin);
}
