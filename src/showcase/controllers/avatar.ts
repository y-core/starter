import { definePage } from "@y-core/forge/app";

import type { AppConfig, AppEnv } from "../../app/types";

const AVATAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Portrait">' +
  '<rect width="64" height="64" fill="#6d8bb8"/>' +
  '<circle cx="32" cy="24" r="12" fill="#f2e2d2"/>' +
  '<path d="M8 64a24 24 0 0 1 48 0Z" fill="#f2e2d2"/>' +
  "</svg>";

/** Serves the showcase's own avatar portrait, so the catalog never reaches for a remote image. */
export const avatarController = definePage<AppEnv, AppConfig>({
  view: () => new Response(AVATAR_SVG, { headers: { "content-type": "image/svg+xml" } }),
});
