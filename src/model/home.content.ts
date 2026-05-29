const foundingYear = 2015;

export const content = {
  title: "Atlas Studio",
  description: "Atlas Studio crafts digital products with purpose — from discovery through design to delivery, we build experiences that connect and endure.",

  hero: {
    headline: "We build digital products people actually want to use",
    subtext: "From early discovery to final delivery, Atlas Studio partners with founders and teams to design, develop, and ship software that earns its place in the world.",
    ctaPrimaryLabel: "Start a project",
    ctaSecondaryLabel: "How We Work",
  },

  about: {
    heading: "What We Do",
    services: [
      {
        title: "Product Design",
        body: "We turn ambiguous problems into clear, considered interfaces. From initial wireframes to polished design systems, every decision is grounded in user needs and business goals — no decoration for decoration's sake.",
        icon: "icon-layout-grid",
      },
      {
        title: "Software Development",
        body: "We build reliable, maintainable web applications using modern toolchains. Whether it's a greenfield product or a legacy system in need of care, we write code that teams can own and evolve over time.",
        icon: "icon-box",
      },
      {
        title: "Growth & Launch",
        body: "Shipping is not the end — it's the beginning. We help teams instrument their products, interpret the signals, and iterate toward outcomes. From launch to traction, we stay in the conversation.",
        icon: "icon-rocket",
      },
    ],
  },

  whychoose: {
    heading: "Why Work With Us",
    intro: "We believe great software comes from genuine partnership — not handoffs, not siloes, not guesswork.",
    highlight: {
      number: String(new Date().getFullYear() - foundingYear),
      label: "years building digital products",
      body: `Founded in ${foundingYear}, Atlas Studio was built on a conviction that craft and clarity go together. We've shipped products across industries, and we bring that experience to every engagement.`,
    },
    commitments: [
      {
        title: "Transparent by Default",
        body: "Weekly updates, honest estimates, and direct access to the people doing the work — no account managers in the middle, no surprises at invoice time.",
        icon: "icon-shield-check",
      },
      {
        title: "Senior Hands Only",
        body: "Your project is handled by experienced engineers and designers from day one — not passed down once it's sold. We stay accountable through the whole arc.",
        icon: "icon-shield-check",
      },
      {
        title: "Outcome-Oriented",
        body: "We measure success by what changes in your business, not by lines of code shipped. If a simpler solution gets you there faster, that's what we recommend.",
        icon: "icon-shield-check",
      },
    ],
  },

  process: {
    heading: "How We Work",
    intro: "A clear, repeatable process — from first conversation to live product.",
    steps: [
      {
        number: "01",
        title: "Discover",
        body: "We start by listening. A focused discovery session maps the problem space, surfaces constraints, and aligns on the right outcome before a single pixel is moved.",
      },
      {
        number: "02",
        title: "Design",
        body: "We prototype early and test often. Wireframes become flows, flows become interfaces — each stage pressure-tested with real users before we build.",
      },
      {
        number: "03",
        title: "Build",
        body: "We develop in short cycles with continuous delivery so you see progress every week, not just at the end. Feedback is welcome throughout — not just at launch.",
      },
      {
        number: "04",
        title: "Ship & Support",
        body: "We deploy, monitor, and stand behind what we build. Post-launch support and iteration are part of every engagement, not a separate contract.",
      },
    ],
  },

  contact: {
    heading: "Let's Talk",
    intro: "Tell us about your project and we'll get back to you within one business day.",
    trust: "All enquiries are handled with complete confidentiality.",
    contacts: [
      {
        name: "Atlas Studio",
        phone: "+1 (555) 012-3456",
        email: "hello@example.com",
      },
    ],
  },

  closing: {
    headline: "Ready to Build Something Worth Using?",
    body: "Whether you have a fully-formed brief or just a hunch that something better is possible — we'd love to hear about it.",
    ctaLabel: "Start a Conversation",
  },

  footer: {
    copyrightStart: foundingYear,
    entity: "Atlas Studio",
  },
} as const;

export type SiteContent = typeof content;
