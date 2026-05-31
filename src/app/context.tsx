import { createRequestContext, hydrateRequestBase, type RequestBase } from "@y-core/forge/context";
import type { AppConfig } from "./config";
import type { AppEnv } from "./env";

export interface AppRequest extends RequestBase {
  baseUrl?: string;
  turnstileSiteKey?: string;
}

const ctx = createRequestContext<AppRequest>("Request");
export const RequestProvider = ctx.Provider;
export const useRequest = ctx.use;
export const useNonce = ctx.useNonce;
export const useCsrfToken = ctx.useCsrfToken;
export const useBaseUrl = () => ctx.use().baseUrl;
export const useTurnstileSiteKey = () => ctx.use().turnstileSiteKey;

/** Per-request JSX bag: universal forge fields + app config values. */
export async function appRequestBag(c: AppEnv, config: AppConfig, opts?: { csrfPath?: string }): Promise<AppRequest> {
  const base = await hydrateRequestBase(c, opts);
  return { ...base, baseUrl: config.site.url.origin, turnstileSiteKey: config.services.turnstile.siteKey };
}
