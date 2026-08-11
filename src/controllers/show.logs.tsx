import { CoreIcon } from "@assets";
import { definePage } from "@y-core/forge/app";
import { kvLogChannel } from "@y-core/forge/logging";
import { loadLogViewer } from "@y-core/forge/logging/show";
import type { AppConfig } from "../app/config";
import { configStore } from "../app/config";
import type { AppEnv } from "../app/context";
import { routes } from "../routes";

/**
 * `loadLogViewer` returns a fully rendered `Response` for every path — the full page, the `<tbody>`
 * HTMX partial, the `<tr>` cursor page and the detail cell — because the record-rendering components
 * are internal as of forge 0.0.66. A loader returning a `Response` short-circuits rendering, so the
 * view is a pass-through and there is no `isHxRequest` branch and no `<Layout>` to wrap.
 */
export const showLogsController = definePage<AppEnv, AppConfig, Response>({
  loader: (c) =>
    loadLogViewer(c, {
      // biome-ignore lint/style/noNonNullAssertion: `access` denies before the channel is built, and the route is debug-only
      channel: (cc) => kvLogChannel(cc.env.LOGS_KV!),
      // Logs carry request paths, request ids and error messages. `access` runs before the channel
      // is touched, so a denial never reads KV. Production (`LOG_LEVEL` unset) gets a 403.
      access: (cc) => configStore.get(cc.env).site.debug,
      icon: CoreIcon,
      basePath: routes.showcase.logs.href(),
    }),
  view: (_c, _cfg, state) => state.data,
});
