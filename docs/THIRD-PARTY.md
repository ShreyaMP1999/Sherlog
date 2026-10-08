# Third-Party Assets

The static browser interface vendors Lucide 0.468.0 from the npm `lucide` package.

- Source: https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js
- License: ISC; preserved in `sherlog/web/LUCIDE-LICENSE` and the bundle header.
- Project: https://lucide.dev

Vendoring the pinned bundle keeps the demo independent of CDNs at runtime. Other dependencies are declared in `pyproject.toml` and pinned in `requirements.lock`.
