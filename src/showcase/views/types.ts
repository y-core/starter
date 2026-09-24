export type ShowcasePage = "index" | "interactive" | "runtime" | "htmx" | "turnstile" | "chrome";

/** A job this band's component is not the answer to, and the catalog id of the one that is. @internal */
export interface CatalogAlternative {
  /** The other component's own job, in the corpus's words. */
  when: string;
  /** Its catalog id — the label and the page are read from `SECTIONS`. */
  id: string;
}
