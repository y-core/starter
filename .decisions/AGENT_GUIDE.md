---
title: Agent and Document Guide
description: "document structure rules, section numbering convention, frontmatter requirements, keyword-dense titles, cross-referencing format, document size guidelines, quick reference convention"
weight: 5
---

# Agent and MCP Document Guide

> This guide is the authoritative source for how `.decisions/` documents should be
> written and structured so they are easy to navigate, search, and reference.
>
> All new and updated governing documents must follow these rules.

---

## 0. Quick Reference

- **Number every section:** `## N. Title` for level-2, `### Na. Title` for level-3 — enables precise section references like §5c
- **Never use dot-notation for subsections:** `### 1.1 Title` breaks parsers (extracts `"1"` not `"1.1"`) — use `### 1a.` instead
- **Make titles keyword-dense:** section titles are what agents scan first — avoid generic words (`Rules`, `Setup`, `Implementation`)
- **Keep descriptions as keyword lists:** frontmatter `description` is used for search and discovery — use comma-separated terms, not prose
- **Every doc needs `## 0. Quick Reference`:** agents read this first to orient without loading the full document
- **Target 200–600 lines per document:** docs over ~500 lines are hard to read in one pass; split by independent concern above 600
- **Use markdown links for cross-references:** `[Section 3](./OTHER_DOC.md)` — links help agents navigate related material

---

## 1. Document Access Model

Agents navigate `.decisions/` documents in three steps:

1. **CLAUDE.md Guide Index** — scan the one-line summaries to pick the relevant document.
2. **`## 0. Quick Reference`** — read the bulleted section map (~30 lines) to identify the target section number.
3. **Target section** — `Read` the document and jump to the specific `## N.` or `### Na.` section.

This pattern avoids full-document reads (which can be 300–600 lines) in most cases.

---

## 2. Section Numbering Convention

Section numbers use a fixed format so each section is individually addressable:

- `## 5. Title` → `number="5"`, `title="Title"`
- `### 5a. Title` → `number="5a"`, `title="Title"`
- `## 10b. Long Title` → `number="10b"`, `title="Long Title"`

**Valid number format:** starts with a digit (`0–9`), followed by zero or more alphanumeric
characters (`0–9`, `a–z`, `A–Z`). Examples: `1`, `2a`, `5c`, `10b`, `0`.

When documenting heading syntax in a `.decisions/` file, indent sample headings or
prefix them with list markers. Literal column-1 `##` / `###` examples are parsed as
real headings.

### 2a. Level-2 Section Numbering (`##`)

Use sequential integers starting from 1. Reserve `0` for the Quick Reference section:

    ## 0. Quick Reference
    ## 1. First Major Topic
    ## 2. Second Major Topic
    ## 2a. Sub-topic of 2 (when a topic requires subordinate grouping)
    ## 3. Third Major Topic

The `Na.` pattern for `##` sections (e.g., `## 2a.`) is appropriate only when a topic
needs a related but distinct grouping that does not warrant its own document.

### 2b. Level-3 Subsection Numbering (`###`)

Use the parent section number as a prefix, followed by a lowercase letter:

    ## 3. Dependency Injection
    ### 3a. Constructor Functions for Dependency Wiring
    ### 3b. Layered Dependency Injection Pattern
    ### 3c. Interface-Based Dependencies for Testability
    ### 3d. Configuration Struct as a Dependency

Letters continue alphabetically: `3a`, `3b`, `3c`, ... `3z`. For sections with more than
26 subsections, continue with `3aa`, `3ab`, etc. (rare in practice).

### 2c. Forbidden Patterns

These formats are silently broken by the parser:

    ### 1.1 Title      ← parser extracts "1", not "1.1" — collides with parent ## 1
    ### 2.3 Title      ← same problem
    ### Title          ← no number at all — only reachable by fragile title substring match
    ## Title           ← no number — same problem

---

## 3. Section Title Guidelines

Section titles are the highest-leverage place to improve search quality. Titles are what
agents scan in the Guide Index and Quick Reference, so they should be keyword-dense and
self-descriptive.

### 3a. Include the Domain Noun

Every title should name the specific concept, pattern, or mechanism it covers.
Avoid titles that are meaningful only in context:

| Avoid | Prefer |
|---|---|
| `### Rules` | `### 3f. Route Guard Rules and Constraints` |
| `### Setup` | `### 1a. createWorker Factory Setup and Configuration` |
| `### Implementation` | `### 3b. HTMX Pattern Implementation with Routes` |
| `### Basic usage` | `### 4a. Middleware Basic Usage and Ordering` |
| `### Structure` | `### 3a. Worker Entry Point Structure and Exports` |

### 3b. Include the Mechanism or Pattern Name

When a subsection describes a known pattern, name the pattern in the title:

| Avoid | Prefer |
|---|---|
| `### The createWorker Pattern` | `### 1a. createWorker Factory Pattern and CSP Merging` |
| `### Route Guards` | `### 1b. Route Guard Sentinels and Middleware Mapping` |
| `### Interface at the consumer` | `### 4a. Repository Interface Defined at Consumer` |
| `### HTMX pattern` | `### 6b. HTMX Out-of-Band Swap Pattern for Partial Updates` |

### 3c. Use Parallel Title Structure Within a Section

Subsections within the same parent should follow a consistent grammatical pattern.
A parent covering rules might use `### Na. X Rule — Constraint/Consequence`. A parent
covering patterns might use `### Na. Pattern Name and Use Cases`. Consistency makes
the Guide Index and Quick Reference easier to scan.

### 3d. Target Length

Titles should be 3–8 words. Short enough to scan in the Guide Index; long enough to
contain keywords. Avoid titles exceeding 10 words.

---

## 4. Frontmatter Requirements

Every `.decisions/` document must have YAML frontmatter at the top:

    ---
    title: Short Human-Readable Title
    description: "keyword one, keyword two, keyword three, ..."
    weight: 15
    ---

### 4a. Title Field

Shown in the CLAUDE.md Guide Index and used as the document's display name. Should be
short (2–5 words), title-cased, and match the file's primary concern.

### 4b. Description Field

Used for discovery and search. Write as a comma-separated list of searchable terms —
not a prose sentence. Include:
- Key concepts covered in the document
- Names of patterns, tools, or mechanisms (e.g., `createWorker factory`, `middleware ordering`, `route guards`, `HTMX patterns`)
- Alternative phrasings agents might search for

Good example:

    description: "createWorker factory, middleware ordering, route guards, HTMX patterns, JSX components, Tailwind v4 tokens, CSP nonce injection, Cloudflare Workers deployment, esbuild bundling, security headers"

Avoid:

    description: "Governing patterns for the starter app — worker factory setup, middleware, routing, and HTMX integration."

### 4c. Weight Field

Controls ordering in the CLAUDE.md Guide Index. Lower weight = higher priority. Assign
weights by importance/access frequency:

| Range | Purpose |
|---|---|
| 1–10 | Meta-documents (this guide, project-level rules) |
| 11–20 | Architectural foundations (project structure, core rules) |
| 21–30 | Implementation patterns (middleware, logging, validation) |
| 31–40 | Specialised guides (concurrency, UI, data storage) |
| 41+ | Reference-only documents (review checklists, sources) |

---

## 5. Cross-Reference Format

### 5a. Inter-Document Links

Use standard markdown links to reference other `.decisions/` documents:

```markdown
See [Section 5](./ERROR_HANDLING.md) for the route guard pattern.
Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §3.
```

Links between `.decisions/` documents help agents navigate related material without
reading the full source section.

### 5b. Intra-Document Section References

When referencing sections within the same document, use the `§N` shorthand inline:

```markdown
See §5a for the error taxonomy before reading this section.
The retry budget (§5g) interacts with circuit breakers (§5h).
```

### 5c. CLAUDE.md Registration

Every new `.decisions/` document must be added to the Guide Index in `CLAUDE.md` with
a one-line description of its topic.

---

## 6. Document Size Guidelines

### 6a. Target Size and Warning Threshold

- **Target:** 200–600 lines per document
- **Warning:** docs over ~500 lines are hard to read in one pass; split them if they cover multiple independently searchable concerns
- **Hard limit signal:** documents exceeding 800 lines typically cover multiple independent concerns and should be split

### 6b. When to Split a Document

Split a document when it covers concerns that an agent would search for independently.
The test: if two different queries would lead to the same document for unrelated reasons,
the document covers too many concerns.

Indicators of a split:
- Two `##` sections have no cross-references to each other
- The document's frontmatter description covers 3+ unrelated topics
- The document exceeds 600 lines

### 6c. Subsection Size Target

Each `###` subsection should be 20–100 lines. Subsections shorter than 15 lines may
belong as a paragraph in the parent `##` section. Subsections longer than 150 lines
should be reviewed for further subdivision.

---

## 7. Quick Reference Section Convention

### 7a. Placement and Format

Every document must begin with a `## 0. Quick Reference` section immediately after the
introductory blockquote. It should contain 5–10 bullet points covering the document's
key topics and their section numbers:

    ## 0. Quick Reference

    - §1 Topic one: brief description of what agents find here
    - §2 Topic two: key pattern or rule name
    - §3a Specific subsection: when this is the primary entry point
    - §4 Topic four: include named tools or patterns

### 7b. Purpose

The Quick Reference serves as a map that lets an agent decide which section to jump to
without reading the full document. An agent reading `## 0. Quick Reference` (~30 lines)
gets enough context to jump to a specific section directly, avoiding a full document load.

### 7c. Keep It Current

When adding new sections to a document, update `## 0. Quick Reference` to include them.
Stale Quick Reference sections that omit important sections reduce navigation efficiency.
