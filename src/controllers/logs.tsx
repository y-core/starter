/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { CoreIcon } from "@assets";
import { definePage } from "@y-core/forge/app";
import { kvLogChannel } from "@y-core/forge/logging";
import { loadLogViewer } from "@y-core/forge/logging/viewer";

import { devAllowanceCtx } from "../app/dev";
import type { AppConfig, AppEnv } from "../app/types";
import { routes } from "../routes";

/** The log viewer, whose loader returns a rendered `Response` for every path, so the view passes it straight through. */
export const logsController = definePage<AppEnv, AppConfig, Response>({
  loader: (c, _config) =>
    loadLogViewer(c, {
      channel: (cc) => kvLogChannel(cc.env.LOGS_KV),
      // This route carries no auth guard, so the gate has to be one no deployment can flip: the
      // allowance is a token only `worker.dev.ts` mints, where an env var would be a value to set.
      access: (cc) => devAllowanceCtx.getOptional(cc) !== undefined,
      icon: CoreIcon,
      basePath: routes.logs.href(),
    }),
  view: (_c, _cfg, state) => state.data,
});
