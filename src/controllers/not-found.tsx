/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { renderShell } from "@y-core/forge/app";
import type { AppContext } from "@y-core/forge/context";

import type { AppEnv } from "../app/types";
import { NotFoundView } from "../views/not-found";

/** The one answer to an unmatched URL, passed to `createApp` as `notFound`. */
export function notFoundController(context: AppContext<AppEnv>, _config: unknown): Promise<Response> {
  return renderShell(
    context,
    <NotFoundView />,
    { mount: "app", page: "not-found", meta: { title: "Page not found", robots: "noindex" } },
    { status: 404 },
  );
}
