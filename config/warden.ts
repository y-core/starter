/** The retrieval set `warden:queries` holds this repository's knowledge index to. */

import type { GoldenQuery } from "@y-core/forge/warden";

/** Every question the index must answer, with the section that must come back. @public */
export const GOLDEN: readonly GoldenQuery[] = [
  // The fleet canon — one per document at least, phrased as the question a reader actually types.
  { query: "what may a view import", expect: "canon:APP_ARCHITECTURE.md#2b", dimension: "boundary" },
  { query: "middleware ordering and where a guard is declared", expect: "canon:BOUNDARIES.md#2b", dimension: "placement" },
  { query: "no PII in a log line", expect: "canon:BOUNDARIES.md#4a", dimension: "prohibition" },
  { query: "blocking invariants a reviewer must catch", expect: "canon:CODE_REVIEW.md#2", dimension: "procedure" },
  { query: "what is the comment budget", expect: "canon:CODE_RULES.md#5a", dimension: "prohibition" },
  { query: "when do I throw instead of returning a Result", expect: "canon:CODE_RULES.md#2a", within: 6, dimension: "procedure" },
  { query: "how should an error cross a layer", expect: "canon:ERROR_HANDLING.md#2b", dimension: "boundary" },
  { query: "when should I upstream a capability to the shared library", expect: "canon:FORGE_CONSUMPTION.md#3c", dimension: "procedure" },
  { query: "exact match assertions on markup", expect: "canon:TESTING.md#3a", dimension: "prohibition" },
  { query: "what happens to an error thrown in waitUntil", expect: "canon:WORKERS_PLATFORM.md#2b", dimension: "rationale" },
  { query: "one request at a time in a recycled isolate", expect: "canon:WORKERS_PLATFORM.md#1a", dimension: "rationale" },
  { query: "the single home rule for a governing document", expect: "canon:AGENT_GUIDE.md#8", dimension: "prohibition" },
  { query: "which suffix reports a command exit status", expect: "canon:AGENT_WORKFLOW.md#3", dimension: "procedure" },
  { query: "how long may a response to a person be", expect: "canon:PLAIN_LANGUAGE.md#8", dimension: "rationale" },
  { query: "which oxlint type-aware rules are the shared base", expect: "canon:CONFIG_BASELINE.md#2a", dimension: "boundary" },
  { query: "which tsconfig strictness flags must every repository set", expect: "canon:CONFIG_BASELINE.md#1", dimension: "procedure" },

  // The coverage assertion reaches only the canon, so these entries are the whole of what holds the
  // installed library's corpus — dropping one retires a document from the index unnoticed.
  { query: "status to level mapping for a log record", expect: "dependency:forge/STRUCTURED_LOGGING.md#4a", dimension: "procedure" },
  // A placement question resolves here because the mechanism is the library's — the
  // `createController` action object, which is also where a route's guards are declared.
  { query: "where does a guard on a route go", expect: "dependency:forge/ROUTING_AND_MIDDLEWARE.md#1b", dimension: "placement" },
  { query: "are hx attributes sanitized by forge", expect: "dependency:forge/HTMX.md#7a", dimension: "rationale" },
  {
    query: "why does a component emit both aria-pressed and data-pressed",
    expect: "dependency:forge/STATE_ATTRIBUTES.md#1b",
    dimension: "rationale",
  },
  { query: "does a later utility displace an earlier one", expect: "dependency:forge/UI_CLASS_COMPOSITION.md#1d", dimension: "boundary" },
  { query: "what does buildTheme produce", expect: "dependency:forge/THEME_GENERATION.md#2a", dimension: "procedure" },
];

/** Questions no document here governs, so retrieval must return nothing rather than a neighbour. @public */
export const NEGATIVE: readonly string[] = [
  // An entry only refuses while the corpus has no words for it: "payment webhook retry" stopped
  // qualifying once the library's `SECURITY_HARDENING.md` brought `webhook` into the vocabulary.
  "what is the payroll tax withholding schedule",
  "how is a mobile push notification token refreshed",
  "which grpc interceptor handles tracing",
  "what is the refund window for annual subscriptions",
  "how do I configure the kubernetes ingress controller",
];
