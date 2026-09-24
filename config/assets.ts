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
          // The ref is a tag because the hashes below pin exact bytes: behind `main`, every routine
          // upstream icon commit would break the build, and that break would look like tampering.
          path: "https://raw.githubusercontent.com/lucide-icons/lucide/1.47.0/icons/",
          files: [
            { key: "phone", file: "phone.svg", sha256: "bd59dd10667cbe410a69e2fbbf4d9645d08abe862c8d89082bd4f533957859a8" }, // feature:contact
            { key: "mail", file: "mail.svg", sha256: "3236a51d5b8ce9b0528cf2e6ad07e527bd636dded6f5a9d656072052b99caea8" },
            { key: "send", file: "send.svg", sha256: "a489257f447b808ab6b258ae888fa49686885bbc30a7a2774d97a01f11f9cd5e" },
            { key: "key", file: "key.svg", sha256: "1f0bdf32374dacfca8cfc7f942c59d27a438e409dccaef11a8ce57de9365ae60" },
            { key: "alert", file: "triangle-alert.svg", sha256: "4866f38b8560d410f21e3226413e0b77997b6dfbb6931fadfe0a0d5aef9ffeb4" },
          ],
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
