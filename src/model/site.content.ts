const foundingYear = 2015;

export const site = {
  title: "Forge Studio",
  description:
    "Forge Studio crafts digital products with purpose — from discovery through design to delivery, we build experiences that connect and endure.",
  footer: { copyrightStart: foundingYear, entity: "Forge Studio" },
} as const;

export type SiteContent = typeof site;
