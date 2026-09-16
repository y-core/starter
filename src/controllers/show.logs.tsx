/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { CoreIcon } from "@assets";
import { definePage } from "@y-core/forge/app";
import { kvLogChannel } from "@y-core/forge/logging";
import { loadLogViewer } from "@y-core/forge/logging/show";

import { devAllowanceCtx } from "../app/context";
import type { AppConfig, AppEnv } from "../app/types";
import { routes } from "../routes";

/**
 * `loadLogViewer` returns a fully rendered `Response` for every path — the full page, the `<tbody>`
 * HTMX partial, the `<tr>` cursor page and the detail cell — because the record-rendering components
 * are internal as of forge 0.0.66. A loader returning a `Response` short-circuits rendering, so the
 * view is a pass-through and there is no `isHxRequest` branch here.
 *
 * The viewer builds no document of its own: it renders through the shell `worker.ts` registers, which
 * is what puts the page inside the `<html>` carrying the dark class and the pre-paint theme script —
 * a viewer owning its own shell can reach neither, and renders light whatever its components ask for.
 */
export const showLogsController = definePage<AppEnv, AppConfig, Response>({
  loader: (c, _config) =>
    loadLogViewer(c, {
      channel: (cc) => kvLogChannel(cc.env.LOGS_KV),
      // Logs carry request paths, request ids and error messages, and this route has no auth guard
      // — so the gate has to be one a deployment cannot flip. It is the dev allowance, not
      // `LOG_LEVEL`: an env var is a value a production deployment can set, whereas the token is
      // minted only by `worker.dev.ts`, which `validate-dev-boundary` keeps out of the production
      // bundle. `access` runs before the channel is touched, so a denial never reads KV.
      access: (cc) => devAllowanceCtx.getOptional(cc) !== undefined,
      icon: CoreIcon,
      basePath: routes.showcase.logs.href(),
    }),
  view: (_c, _cfg, state) => state.data,
});
