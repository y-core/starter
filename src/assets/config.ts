import { defineAssetsConfig } from "@y-core/forge/assets";

export default defineAssetsConfig({
  paths: {
    publicDir: "public/assets",
    publicPrefix: "/assets",
  },
  css: [
    {
      tool: "tailwindcss",
      input: "src/assets/tailwind.css",
      output: "css/main.css",
    },
  ],
  js: {
    bundles: [
      {
        entry: "src/client/main.ts",
        outdir: "js",
        splitting: true,
        format: "esm",
      },
    ],
  },
  sprites: {
    main: {
      target: "svg/sprite.svg",
      sources: [
        {
          path: "src/assets/svg/",
          files: ["logo.svg"],
        },
        {
          path: "node_modules/@y-core/forge/src/ui/assets/core",
          files: ["hamburger.svg", "spinner.svg"],
        },
        {
          path: "node_modules/@y-core/forge/src/ui/assets/theme/",
          files: ["sun.svg", "moon.svg", "monitor.svg"],
        },
        {
          path: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/",
          files: [
            "box.svg",
            "rocket.svg",
            "layout-grid.svg",
            "shield-check.svg",
            "phone.svg",
            "mail.svg",
            "send.svg",
          ],
        },
      ],
    },
  },
});
