import type { content } from "./home.content";
import type { site } from "./site.content";

/** The site-wide copy every page is framed by. @public */
export type SiteContent = typeof site;

/** The home page's copy. @public */
export type HomeContent = typeof content;
