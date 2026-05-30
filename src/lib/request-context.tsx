import { createRequestContext } from "@y-core/forge/context";

export interface AppRequest {
  nonce: string;
  csrfToken: string;
  baseUrl?: string;
  turnstileSiteKey?: string;
}

const ctx = createRequestContext<AppRequest>("Request");
export const RequestProvider = ctx.Provider;
export const useRequest = ctx.use;
export const useNonce = () => useRequest().nonce;
export const useCsrfToken = () => useRequest().csrfToken;
export const useBaseUrl = () => useRequest().baseUrl;
export const useTurnstileSiteKey = () => useRequest().turnstileSiteKey;
