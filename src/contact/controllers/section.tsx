/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import type { JSXNode } from "@y-core/forge/jsx";

import type { AppConfig, AppEnv } from "../../app/types";
import { mintContactCsrf } from "../app/middleware";
import { content } from "../model/contact.content";
import { contactRouteMap } from "../routes";
import { ContactSection } from "../views/section";

/** Renders the home page's contact section, carrying a token minted for the route its form posts to. */
export async function renderContactSection(c: ForgeAppContext<AppEnv>, config: AppConfig): Promise<JSXNode> {
  const csrfToken = await mintContactCsrf(c, contactRouteMap.submit.href());
  return <ContactSection content={content} csrfToken={csrfToken} turnstileSiteKey={config.turnstile.siteKey} />;
}
