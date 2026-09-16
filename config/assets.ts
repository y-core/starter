import { defineAssetsConfig } from "@y-core/forge/tooling/assets";
import { forgeUiSpriteSources } from "@y-core/forge/ui/assets/build";

export default defineAssetsConfig({
  paths: { publicDir: "public/assets", publicPrefix: "/assets" },
  css: [{ tool: "tailwindcss", input: "src/assets/tailwind.css", output: "css/main.css" }],
  js: { bundles: [{ entry: "src/client/main.ts", outdir: "js", splitting: true, format: "esm" }] },
  sprites: {
    core: {
      target: "svg/sprite.svg",
      sources: [
        { path: "src/assets/svg/", files: ["logo.svg"] },
        {
          path: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/",
          files: ["phone.svg", "mail.svg", "send.svg", "key.svg", { key: "alert", file: "triangle-alert.svg" }],
        },
        ...forgeUiSpriteSources(),
      ],
    },
  },
  icons: {
    src: "src/assets/svg/logo.svg",
    outDir: "public",
    publicPrefix: "/static",
    lightColor: "#2A5555",
    darkColor: "#99CCCC",
    app: { name: "Forge Studio", shortName: "Forge", backgroundColor: "#f0f7f7" },
    outputs: [
      { kind: "svg", file: "favicon.svg" },
      { kind: "png", file: "apple-touch-icon.png", size: 180, rel: "apple-touch-icon" },
      { kind: "png", file: "icon-192.png", size: 192, manifest: true },
      { kind: "png", file: "icon-512.png", size: 512, manifest: true },
      { kind: "ico", file: "favicon.ico", sizes: [16, 32, 48], root: true },
      { kind: "manifest", file: "site.webmanifest" },
    ],
  },
});
