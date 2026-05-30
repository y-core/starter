const foundingYear = 2015;

export const content = {
  title: "Forge Studio",
  description:
    "Forge Studio crafts digital products with purpose — from discovery through design to delivery, we build experiences that connect and endure.",

  hero: {
    headline: "We build digital products people actually want to use",
    subtext:
      "From early discovery to final delivery, Forge Studio partners with founders and teams to design, develop, and ship software that earns its place in the world.",
    ctaPrimaryLabel: "Start a project",
    ctaSecondaryLabel: "Get in touch",
  },

  contact: {
    heading: "Let's Talk",
    intro: "Tell us about your project and we'll get back to you within one business day.",
    trust: "All enquiries are handled with complete confidentiality.",
    contacts: [{ name: "Forge Studio", phone: "+1 (555) 012-3456", email: "hello@example.com" }],
  },

  footer: { copyrightStart: foundingYear, entity: "Forge Studio" },
} as const;

export type SiteContent = typeof content;
