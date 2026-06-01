import { defineAssetsConfig } from "@y-core/forge/assets";

export default defineAssetsConfig({
  paths: { publicDir: "public/assets", publicPrefix: "/assets" },
  css: [{ tool: "tailwindcss", input: "src/assets/tailwind.css", output: "css/main.css" }],
  js: { bundles: [{ entry: "src/client/main.ts", outdir: "js", splitting: true, format: "esm" }] },
  sprites: {
    core: {
      target: "svg/sprite.svg",
      sources: [
        { path: "src/assets/svg/", files: ["logo.svg"] },
        { path: "node_modules/@y-core/forge/src/ui/assets/core", files: ["hamburger.svg", "spinner.svg"] },
        { path: "node_modules/@y-core/forge/src/ui/assets/theme/", files: ["sun.svg", "moon.svg", "monitor.svg"] },
        { path: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/", files: ["phone.svg", "mail.svg", "send.svg"] },
      ],
    },
  },
  icons: {
    src: "src/assets/svg/logo.svg",
    outDir: "public",
    lightColor: "#2A5555",
    darkColor: "#99CCCC",
    app: { name: "Forge Studio", shortName: "Forge", backgroundColor: "#f0f7f7" },
    outputs: [
      { kind: "svg", file: "favicon.svg" },
      { kind: "png", file: "apple-touch-icon.png", size: 180 },
      { kind: "png", file: "icon-192.png", size: 192, manifest: true },
      { kind: "png", file: "icon-512.png", size: 512, manifest: true },
      { kind: "ico", file: "favicon.ico", sizes: [16, 32, 48] },
      { kind: "manifest", file: "site.webmanifest" },
    ],
  },
});
