/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage } from "@y-core/forge/app";
import { fragmentResponse } from "@y-core/forge/http";
import { renderToString } from "@y-core/forge/jsx";

import type { AppConfig, AppEnv } from "../../app/types";
import type { DependentData, PaginateData, PreviewData, SearchData, ToastData, ValidateData } from "../model/types";
import { DependentFragment, PaginateFragment, PreviewFragment, SearchFragment, ToastFragment, ValidateFragment } from "../views/sections";

/** Renders the button preview for the tone, appearance and size in the query string. */
export const previewController = definePage<AppEnv, AppConfig, PreviewData>({
  loader: (c) => {
    const q = c.url.searchParams;
    return { tone: q.get("tone") ?? "primary", appearance: q.get("appearance") ?? "solid", size: q.get("size") ?? "md" };
  },
  view: async (_c, _config, state) => fragmentResponse(await renderToString(<PreviewFragment data={state.data} />)),
});

/** Renders the email field, validated against the address in the query string. */
export const validateController = definePage<AppEnv, AppConfig, ValidateData>({
  loader: (c) => ({ email: c.url.searchParams.get("email") ?? "" }),
  view: async (_c, _config, state) => fragmentResponse(await renderToString(<ValidateFragment data={state.data} />)),
});

/** Renders the components matching the search term in the query string. */
export const searchController = definePage<AppEnv, AppConfig, SearchData>({
  loader: (c) => ({ q: c.url.searchParams.get("q") ?? "" }),
  view: async (_c, _config, state) => fragmentResponse(await renderToString(<SearchFragment data={state.data} />)),
});

/** Renders the requested table page, clamped to at least 1. */
export const paginateController = definePage<AppEnv, AppConfig, PaginateData>({
  loader: (c) => {
    const raw = c.url.searchParams.get("page");
    // `Math.max` propagates NaN, so `?page=abc` used to render an empty tbody, hide *both* pager
    // buttons and print "Page NaN of 4". The parse has to be tested, not merely clamped.
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return { page: Number.isFinite(parsed) ? Math.max(1, parsed) : 1 };
  },
  view: async (_c, _config, state) => fragmentResponse(await renderToString(<PaginateFragment data={state.data} />)),
});

/** Renders the item select for the category in the query string. */
export const dependentController = definePage<AppEnv, AppConfig, DependentData>({
  loader: (c) => ({ category: c.url.searchParams.get("category") ?? "fruit" }),
  view: async (_c, _config, state) => fragmentResponse(await renderToString(<DependentFragment data={state.data} />)),
});

/** Renders an out-of-band toast of the variant in the query string. */
export const toastController = definePage<AppEnv, AppConfig, ToastData>({
  loader: (c) => ({ type: c.url.searchParams.get("type") ?? "success" }),
  view: async (_c, _config, state) => fragmentResponse(await renderToString(<ToastFragment data={state.data} />)),
});
