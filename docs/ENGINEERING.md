# Engineering Decisions and Interview Preparation

## Why This Shape

**LangGraph:** explicit state and conditional edges make the investigation loop easy to inspect and bound. For the four-call baseline alone, ordinary functions would suffice; the graph supports a replaceable model planner and repeated tool decisions.

**One agent:** multiple agents would introduce coordination and cost without a demonstrated need in this narrow incident scope.

**Structured plans:** the model chooses an allowed tool and arguments, rather than generating executable code. Validation rejects arbitrary tools, unexpected arguments, and overlong queries.

**Separate verifier:** retrieval can be flexible while diagnosis conditions remain reproducible. The tradeoff is limited coverage: unfamiliar failures produce an inconclusive result.

**Uncertainty:** a matching log alone does not establish a cause. Corroborating metrics and deployment timing improve specificity on the development cases. Even agreeing signals represent a hypothesis, not proof of causality.

**Support labels:** corroborated, conflicting, and insufficient describe evidence conditions. They are not probability estimates.

**Small interface:** no frontend build tools or external CDN are needed. The browser renders evidence as text, so log content does not become HTML.

## Know These Limits

- The dataset is small, synthetic, public, and used during development. A perfect score is a regression result.
- Metrics are before/after snapshots, not a live observability backend. No actual Prometheus, Datadog, or cloud integration is claimed.
- The offline planner has a fixed tool order; the Ollama planner can choose tools and queries dynamically.
- Runbook retrieval uses keyword overlap. There are no embeddings or vector database in this version.
- The verifier uses known patterns and thresholds. A misleading ERROR-level log with matching metrics may still produce a false hypothesis.
- The untrusted-log fixture checks a narrow case. It is not a general prompt-injection security benchmark.
- A valid citation can still be irrelevant. Add expert entailment reviews for stronger evaluation.
- The server is a localhost demo. Authentication, production deployment, streaming progress, and durable checkpoints are future work.
- Ollama failures are surfaced; there is no hidden model fallback. Model-specific accuracy must be measured separately.

## Seven Learning Sessions

1. **Understand the state:** draw the plan/tool/verify loop and trace one incident through `agent.py`.
2. **Inspect tool contracts:** call each tool, then explain incident isolation and why a generic shell tool is excluded.
3. **Change evidence:** lower the pool metric in a copied fixture. Explain why the diagnosis changes without changing the alert.
4. **Run a real model:** configure Ollama, record its selected tools, and evaluate all cases. Explain why its performance can differ from offline mode.
5. **Measure failures:** deliberately use a low budget, malformed plan, or unavailable metrics. Inspect the report and tests.
6. **Author unseen cases:** ask a peer to create five fresh incidents without reading the diagnosis rules. Freeze the code first, then evaluate and document failures.
7. **Add one adapter:** integrate a small local JSONL log source with explicit service/time filtering, then add contract tests and compare results.

## Questions to Practice

- When is a deterministic workflow sufficient, and when does model planning help?
- How do you prevent a tool result from becoming an instruction?
- Why are reference validity and factual groundedness different metrics?
- What happens if a model repeats a tool call or stops early?
- What should be cached, persisted, or streamed in a production version?
- How would you evaluate cost, latency, abstention quality, and false diagnoses?
- Why is a recent deployment correlation insufficient by itself?
- What evidence would justify expanding this beyond a prototype?

Describe only work and concepts you can demonstrate yourself. A potential portfolio description, after understanding and extending the project:

"Built and evaluated a LangGraph incident investigation prototype with four read-only tools, evidence validation, bounded execution, a browser demo, and automated regression checks."

When discussing results, qualify them as synthetic development cases and keep offline/model measurements separate.
