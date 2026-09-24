import type { Forge } from "@y-core/forge/app";
import type { DevAllowance } from "@y-core/forge/dev";
import { createController } from "@y-core/forge/router";

import type { AppEnv } from "../app/types";
import type { HomeSlots } from "../controllers/home";
import { routes } from "../routes";
import type { PrimaryNav } from "../views/nav";
import { renderContactSection } from "./controllers/section";
import { createContactController } from "./controllers/submit";
import { content } from "./model/contact.content";
import { contactRouteMap } from "./routes";

/** Mounts the contact slice on the app and contributes its links, hero calls to action and home section. */
export function registerContact(app: Forge<AppEnv>, primaryNav: PrimaryNav, home: HomeSlots, dev?: DevAllowance): void {
  app.map(contactRouteMap, createController(contactRouteMap, { actions: { submit: createContactController(dev) } }));
  primaryNav.contribute({
    items: [{ label: "Contact", href: "contact" }],
    // The bar is in the shared layout, so a bare `#contact` would point at nothing off the home page.
    hrefs: { contact: `${routes.home.href()}#contact` },
    footer: [{ label: "Contact", href: "contact" }],
  });
  home.contribute({
    ctas: [
      { label: content.ctaPrimaryLabel, href: "#contact", emphasis: "primary" },
      { label: content.ctaSecondaryLabel, href: "#contact", emphasis: "secondary" },
    ],
    section: renderContactSection,
  });
}
