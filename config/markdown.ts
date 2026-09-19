/** The markdown conventions this app's prose is held to. */

import type { MarkdownCheckConfig } from "@y-core/forge/tooling/gate";

export default {
  // The source trees carry no markdown yet: they are named so the `README.md` the Governance Router
  // sends consumer-facing usage to is held to this layout the day it lands, rather than after.
  sources: ["src", "config", "tests", "README.md", "CLAUDE.md", "AGENTS.md"],
  rules: {
    // 148 is `.oxfmtrc.json`'s `printWidth`, so prose and TypeScript wrap at the same column.
    lineLength: { limit: 148, level: "fail", exempt: ["link", "table", "heading", "fence"] },
  },
} satisfies Omit<MarkdownCheckConfig, "root">;
