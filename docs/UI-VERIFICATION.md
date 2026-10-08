# Interface Verification

The case-ledger redesign was exercised in the browser against the running local API.

- Checkout investigation returns the expected diagnosis and four tool calls.
- The evidence trail displays actual tool record counts from the completed report.
- Selecting Metrics filters the evidence table to five records; All evidence restores nine.
- Selecting citation L1 highlights its source record in the evidence table.
- Arrow-key navigation changes the selected tab and moves focus.
- An unmatched search displays an empty state; clearing it restores the ledger.
- Ollama-unavailable errors clear the previous result and disable export.
- The evidence canvas is visible and correctly framed on desktop and mobile.
- At 390px and 320px, page content width equals viewport width.
- Reduced-motion preferences disable CSS transitions and canvas flow animation.
- All 21 Python tests pass, including the newly bundled icon asset route.

The diagram shows a recorded tool trace once results arrive. It does not imply that the synchronous API streams tool execution.

Desktop and mobile images in this folder show browser captures of the redesigned application.
