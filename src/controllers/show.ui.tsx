/** @jsxImportSource @y-core/forge */
import { CoreIcon } from "@assets";
import { definePage } from "@y-core/forge/app";
import { renderPage } from "@y-core/forge/render";
import type { DependentData, PaginateData, PreviewData, SearchData, ShowcaseData, ToastData, ValidateData } from "@y-core/forge/ui/show";
import {
  loadDependent,
  loadPaginate,
  loadPreview,
  loadSearch,
  loadShowcase,
  loadToast,
  loadValidate,
  renderDependent,
  renderPaginate,
  renderPreview,
  renderSearch,
  renderToast,
  renderValidate,
  ShowcaseContent,
  showcasePaths,
} from "@y-core/forge/ui/show";
import type { AppConfig } from "../app/config";
import type { AppEnv } from "../app/context";
import { renderContext } from "../app/context";
import { routes } from "../routes";
import { Layout } from "../views/layout";

const uiBase = routes.showcase.ui.index.href();
const uiApi = `${uiBase}/api`;

export const showUiController = definePage<AppEnv, AppConfig, ShowcaseData>({
  loader: (c) => loadShowcase(c, { basePath: uiBase, apiPath: uiApi }),
  view: async (c, config, state) => {
    const ctx = await renderContext(c, config);
    return renderPage(
      <Layout ctx={ctx}>
        <ShowcaseContent data={state.data} icon={CoreIcon} />
      </Layout>,
    );
  },
});

export const showUiPreview = definePage<AppEnv, AppConfig, PreviewData>({
  loader: (c) => loadPreview(c),
  view: (_c, _config, state) => renderPreview(state.data, CoreIcon),
});

export const showUiValidate = definePage<AppEnv, AppConfig, ValidateData>({
  loader: (c) => loadValidate(c),
  view: (_c, _config, state) => renderValidate(state.data),
});

export const showUiSearch = definePage<AppEnv, AppConfig, SearchData>({
  loader: (c) => loadSearch(c),
  view: (_c, _config, state) => renderSearch(state.data),
});

export const showUiPaginate = definePage<AppEnv, AppConfig, PaginateData>({
  loader: (c) => loadPaginate(c, showcasePaths(uiBase, uiApi)),
  view: (_c, _config, state) => renderPaginate(state.data),
});

export const showUiDependent = definePage<AppEnv, AppConfig, DependentData>({
  loader: (c) => loadDependent(c),
  view: (_c, _config, state) => renderDependent(state.data, CoreIcon),
});

export const showUiToast = definePage<AppEnv, AppConfig, ToastData>({
  loader: (c) => loadToast(c),
  view: (_c, _config, state) => renderToast(state.data),
});
