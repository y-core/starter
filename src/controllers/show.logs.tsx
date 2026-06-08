/** @jsxImportSource @y-core/forge/jsx */
import { CoreIcon } from "@assets";
import { definePage } from "@y-core/forge/app";
import { isHxRequest } from "@y-core/forge/html/htmx";
import { kvLogChannel } from "@y-core/forge/logging";
import { LogViewerContent, type LogViewerLoaderData, loadLogViewer, renderLogFragment } from "@y-core/forge/logging/show";
import { renderPage } from "@y-core/forge/render";
import type { AppConfig } from "../app/config";
import type { AppEnv } from "../app/context";
import { renderContext } from "../app/context";
import { routes } from "../routes";
import { Layout } from "../views/layout";

export const showLogsController = definePage<AppEnv, AppConfig, LogViewerLoaderData>({
  // biome-ignore lint/style/noNonNullAssertion: LOGS_KV presence is guarded by route-level check
  loader: (c) => loadLogViewer(c, { channel: (cc) => kvLogChannel(cc.env.LOGS_KV!), basePath: routes.showcase.logs.href() }),
  view: async (c, config, state) => {
    if (isHxRequest(c)) {
      return renderLogFragment(state.data);
    }
    const ctx = await renderContext(c, config);
    return renderPage(
      <Layout ctx={ctx}>
        <LogViewerContent data={state.data} icon={CoreIcon} />
      </Layout>,
    );
  },
});
