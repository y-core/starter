/** @jsxImportSource @y-core/forge */
import { CoreIcon } from "@assets";
import { definePage } from "@y-core/forge/app";
import { LogViewerContent, type LogViewerLoaderData, readLogViewer } from "@y-core/forge/logging/http";
import { renderPage } from "@y-core/forge/render";
import type { AppConfig } from "../app/config";
import type { AppEnv } from "../app/context";
import { renderContext } from "../app/context";
import { routes } from "../routes";
import { Layout } from "../views/layout";

export const adminLogsController = definePage<AppEnv, AppConfig, LogViewerLoaderData>({
  // biome-ignore lint/style/noNonNullAssertion: LOGS_KV presence is guarded by route-level check
  loader: (c) => readLogViewer(c, { kv: (cc) => cc.env.LOGS_KV!, basePath: routes.adminLogs.href() }),
  view: async (c, config, state) => {
    const ctx = await renderContext(c, config);
    return renderPage(
      <Layout ctx={ctx}>
        <LogViewerContent data={state.data} icon={CoreIcon} />
      </Layout>,
    );
  },
});
