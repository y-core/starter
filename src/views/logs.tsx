/** @jsxImportSource @y-core/forge */
import { html } from "@y-core/forge/http";
import { LogFilterBar, LogTable, type LogViewerLoaderData } from "@y-core/forge/logging/http";
import type { RouteView } from "@y-core/forge/router";
import { appContext } from "../app/context";
import type { AppEnvironment } from "../app/env";
import { content } from "../model/home.content";
import { Layout } from "./layout";

const TBODY_ID = "log-tbody";

export const logsView: RouteView<AppEnvironment, LogViewerLoaderData> = async (c, config, { data }) => {
  const ctx = await appContext(c, config);
  return c.html(
    html`<!DOCTYPE html>${(
      <Layout ctx={ctx} content={content}>
        <main id='main-content' class='mx-auto max-w-7xl px-6 py-10 lg:px-10'>
          <h1 class='mb-6 text-2xl font-semibold text-brand-900'>Request Log</h1>
          <LogFilterBar level={data.level} q={data.q} targetId={TBODY_ID} formAction={data.basePath} />
          <div class='mt-6 overflow-x-auto rounded-2xl border border-brand-200'>
            <LogTable rows={data.rows} cursor={data.cursor} complete={data.complete} loadMoreAction={data.basePath} tbodyId={TBODY_ID} />
          </div>
        </main>
      </Layout>
    )}`,
  );
};
