import type { content } from "./home.content";
import type { site } from "./site.content";

/** The site-wide copy every page is framed by. @public */
export type SiteContent = typeof site;

/** The home page's copy. @public */
export type HomeContent = typeof content;

/** One hero call to action a contribution adds; the first primary one leads. @public */
export interface HeroCta {
  label: string;
  href: string;
  emphasis: "primary" | "secondary";
}
