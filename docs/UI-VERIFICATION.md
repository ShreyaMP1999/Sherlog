# Workspace Verification

The multipage workspace was exercised against the running localhost API with browser controls.

- Case cards navigate to individual investigation routes.
- Search, pinned-case filters, and grid/list controls respond to interaction.
- Checkout investigation produces the evidence-backed diagnosis and four tool calls.
- Setting a two-call budget produces an incomplete report with an honest 2 / 2 count.
- Citations navigate to evidence; cited-only filtering returns three records.
- Evidence and runbook drawers display actual records and rule conditions.
- Comparison selects a second synthetic snapshot without inventing a diagnosis.
- The evaluation lab reruns all 12 offline cases and displays measured results.
- Settings explicitly report the unavailable local Ollama service.
- History retains runs; notes and pins survive page reloads.
- At 390px and 320px, the investigation and evidence pages have no horizontal page overflow.
- Desktop and mobile screenshots capture actual browser-rendered pages.
- All 26 Python tests pass, including live evaluation and custom-budget endpoints.

The trail depicts a recorded trace after the synchronous API completes, not live streamed execution. Browser storage is device-specific and can be cleared by browser settings. Offline scores are public development-fixture results, not LLM or production performance.
