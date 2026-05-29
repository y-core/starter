import { createCsrfToken, importCsrfKey } from "@y-core/forge/form";

let cachedKey: CryptoKey | undefined;
let cachedSecret: string | undefined;

export async function makeCsrfToken(secret: string, path: string): Promise<string> {
  if (!cachedKey || cachedSecret !== secret) {
    cachedKey = await importCsrfKey(secret);
    cachedSecret = secret;
  }
  return createCsrfToken(cachedKey, path);
}
