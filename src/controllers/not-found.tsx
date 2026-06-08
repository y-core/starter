/** @jsxImportSource @y-core/forge/jsx */
import { getAppContext, type RequestContext } from "@y-core/forge/context";
import { renderPage } from "@y-core/forge/render";
import type { AppConfig } from "../app/config";
import type { AppEnv } from "../app/context";
import { renderContext } from "../app/context";
import { NotFoundView } from "../views/not-found";

export async function notFoundController(context: RequestContext, _config?: unknown): Promise<Response> {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  const ctx = await renderContext(c, c.config); // no csrfPath → empty token (no form)
  return renderPage(<NotFoundView ctx={ctx} />, { status: 404 });
}
