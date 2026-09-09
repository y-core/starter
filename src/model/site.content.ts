import type { PageMeta } from "@y-core/forge/app";

const foundingYear = 2015;

export const site = {
  title: "Forge Studio",
  description:
    "Forge Studio crafts digital products with purpose — from discovery through design to delivery, we build experiences that connect and endure.",
  footer: { copyrightStart: foundingYear, entity: "Forge Studio" },
} as const;

// The origin is a parameter rather than a read: `canonical` and `og.image` must be absolute and
// forge derives neither, because a Worker behind a proxy sees a `c.url` that is not the public one.
/** The base every page's own descriptor is merged over — the site speaking for itself. */
export function siteMeta(baseUrl?: string): PageMeta {
  const home = baseUrl === undefined ? undefined : `${baseUrl}/`;
  return {
    title: site.title,
    description: site.description,
    ...(home === undefined ? {} : { canonical: home }),
    og: { title: site.title, description: site.description, type: "website", ...(home === undefined ? {} : { url: home }) },
    twitter: { card: "summary", title: site.title, description: site.description },
    jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: site.title, description: site.description, url: home },
  };
}
