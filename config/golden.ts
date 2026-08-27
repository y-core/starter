/** The retrieval set `warden:queries` holds this repository's knowledge index to.
 *
 *  Forge ships a golden set written for its own corpus, where the documents are `libs` and the
 *  vocabulary is a library's. Starter is subject to the `apps` canon, so that set leaves every
 *  `apps` document top-1 for nothing and half its expectations naming files that do not exist here.
 *  These replace it.
 *
 *  **Starter has the fleet's worst filename collisions against forge's own `docs/`** —
 *  `CODE_REVIEW.md`, `ERROR_HANDLING.md`, `INPUT_VALIDATION.md`, `SOURCE_OF_TRUTH.md` and
 *  `STRUCTURED_LOGGING.md` are all spelled the same in both — which is exactly why it is measured
 *  first when the corpus grows.
 *
 *  **A query earns its place by failing when retrieval stops serving it, not by passing today.**
 *  Every canon document must be top-1 for at least one query — that assertion is what stops the set
 *  decaying into a fixture nobody rereads — and this repository's own thirteen documents are held
 *  the same way, since a ruling nobody can find is a ruling nobody follows. The installed library's
 *  documents are held by the last four entries alone: the coverage assertion never reaches them.
 */

import type { GoldenQuery } from "@y-core/forge/warden";

/** Every question the index must answer, with the section that must come back. @public */
export const GOLDEN: readonly GoldenQuery[] = [
  // The fleet canon — one per document at least, phrased as the question a reader actually types.
  { query: "where does a guard on a route go", expect: "canon:APP_ARCHITECTURE.md#5a", dimension: "placement" },
  { query: "what may a view import", expect: "canon:APP_ARCHITECTURE.md#2b", dimension: "boundary" },
  { query: "middleware ordering and where a guard is declared", expect: "canon:BOUNDARIES.md#2b", dimension: "placement" },
  { query: "no PII in a log line", expect: "canon:BOUNDARIES.md#4a", dimension: "prohibition" },
  { query: "blocking invariants a reviewer must catch", expect: "canon:CODE_REVIEW.md#2", dimension: "procedure" },
  { query: "what is the comment budget", expect: "canon:CODE_RULES.md#5a", dimension: "prohibition" },
  { query: "when do I throw instead of returning a Result", expect: "canon:CODE_RULES.md#2a", within: 6, dimension: "procedure" },
  { query: "how should an error cross a layer", expect: "canon:ERROR_HANDLING.md#2b", dimension: "boundary" },
  { query: "when should I upstream a capability to the shared library", expect: "canon:FORGE_CONSUMPTION.md#3c", dimension: "procedure" },
  { query: "exact match assertions on markup", expect: "canon:TESTING.md#3a", dimension: "prohibition" },
  { query: "what runs after the response is sent on Workers", expect: "canon:WORKERS_PLATFORM.md#2b", dimension: "rationale" },
  { query: "one request at a time in a recycled isolate", expect: "canon:WORKERS_PLATFORM.md#1a", dimension: "rationale" },
  { query: "the single home rule for a governing document", expect: "canon:AGENT_GUIDE.md#8", dimension: "prohibition" },
  { query: "which suffix reports a command exit status", expect: "canon:AGENT_WORKFLOW.md#3", dimension: "procedure" },
  { query: "how long may a response to a person be", expect: "canon:PLAIN_LANGUAGE.md#8", dimension: "rationale" },

  // This repository's own rulings — the half a canon query can never reach.
  { query: "the createWorker composition root", expect: "project:docs/ARCHITECTURE_GUIDE.md#1a", dimension: "placement" },
  { query: "may a handler skip the service layer", expect: "project:docs/ARCHITECTURE_GUIDE.md#2c", dimension: "prohibition" },
  { query: "do not re-implement a forge utility", expect: "project:docs/CODE_REVIEW.md#3a", dimension: "prohibition" },
  { query: "where is SITE_ORIGIN declared", expect: "project:docs/CONFIGURATION_AND_SECRETS.md#3d", dimension: "placement" },
  { query: "how do I generate the CSRF_SECRET", expect: "project:docs/CONFIGURATION_AND_SECRETS.md#6c", dimension: "procedure" },
  { query: "sql tagged template parameterized query", expect: "project:docs/DATA_STORAGE.md#3b", dimension: "procedure" },
  { query: "one binding shape check per isolate", expect: "project:docs/DATA_STORAGE.md#5b", dimension: "procedure" },
  { query: "never mix renderPage with an HTMX fragment route", expect: "project:docs/ERROR_HANDLING.md#2b", dimension: "prohibition" },
  { query: "minting a CSRF token in a test", expect: "project:docs/HANDLER_TESTING.md#4a", dimension: "procedure" },
  { query: "no 200 on a guard failure", expect: "project:docs/HANDLER_TESTING.md#6e", dimension: "prohibition" },
  { query: "the honeypot field", expect: "project:docs/INPUT_VALIDATION.md#3a", dimension: "procedure" },
  { query: "turnstile captcha verification", expect: "project:docs/INPUT_VALIDATION.md#3b", dimension: "procedure" },
  { query: "requestId propagation to downstream services", expect: "project:docs/MIDDLEWARE_AND_CONTEXT.md#1c", within: 4, dimension: "procedure" },
  { query: "the mintCsrf scope", expect: "project:docs/MIDDLEWARE_AND_CONTEXT.md#4c", dimension: "boundary" },
  // Named by this repository's own file. Asked bare, "binding a controller to a route" is answered
  // at least as well by the library's own routing document, which warden now serves here — and the
  // question a reader of *this* repository is asking is which file does the binding.
  { query: "binding a controller in router.tsx", expect: "project:docs/ROUTING.md#1b", dimension: "placement" },
  { query: "why csrfVerifyGuard on a GET", expect: "project:docs/ROUTING.md#4b", dimension: "rationale" },
  { query: "which facts are request-path facts", expect: "project:docs/SOURCE_OF_TRUTH.md#2b", dimension: "boundary" },
  { query: "dual channel logging setup", expect: "project:docs/STRUCTURED_LOGGING.md#1a", dimension: "procedure" },
  { query: "status to level mapping for a log record", expect: "project:docs/STRUCTURED_LOGGING.md#3a", dimension: "procedure" },
  { query: "preventing a flash of unstyled content", expect: "project:docs/UI_GUIDE.md#2b", dimension: "procedure" },
  { query: "the navbar resumable scope", expect: "project:docs/UI_GUIDE.md#6c", dimension: "placement" },
  { query: "run_worker_first and the asset root exclusion list", expect: "project:docs/WEB_DESIGN.md#5b", dimension: "procedure" },
  { query: "how is the rate limit key selected", expect: "project:docs/WEB_DESIGN.md#3c", dimension: "procedure" },

  // The installed library's own documents, served here because the warden rows pass `dependency`.
  // The coverage assertion reaches only the canon, so nothing but these holds the third corpus: a
  // question whose answer is the library's and nowhere else, one per shape of that question.
  { query: "are hx attributes sanitized by forge", expect: "dependency:forge/HTMX.md#7a", dimension: "rationale" },
  {
    query: "why does a component emit both aria-pressed and data-pressed",
    expect: "dependency:forge/STATE_ATTRIBUTES.md#1b",
    dimension: "rationale",
  },
  { query: "does a later utility displace an earlier one", expect: "dependency:forge/UI_CLASS_COMPOSITION.md#1d", dimension: "boundary" },
  { query: "what does buildTheme produce", expect: "dependency:forge/THEME_GENERATION.md#2a", dimension: "procedure" },
];

/** Questions no document here governs, so retrieval must return nothing rather than a confident
 *  neighbour. Each names a real concern this application simply does not have. @public */
export const NEGATIVE: readonly string[] = [
  // Not "how do I configure a payment webhook retry": the library's `SECURITY_HARDENING.md` governs
  // webhook signature verification, so `webhook` is vocabulary this corpus now carries and the
  // question is no longer one it has no words for. An entry that stops meeting that precondition is
  // replaced rather than answered by moving the floor.
  "what is the payroll tax withholding schedule",
  "how is a mobile push notification token refreshed",
  "which grpc interceptor handles tracing",
  "what is the refund window for annual subscriptions",
  "how do I configure the kubernetes ingress controller",
];
