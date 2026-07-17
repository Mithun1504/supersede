# Design QA

Reviewed July 15, 2026 against the three approved visual targets using the in-app Browser at its natural 1280 × 720 desktop viewport, plus automated desktop and Pixel 7 coverage.

Each comparison is target on the left and implementation on the right. The browser capture API rasterizes at device-pixel ratio 2 while returning a 1× bitmap, so the implementation half is a faithful top-left viewport crop rather than a full-width export. Layout measurements and overflow were also checked from the live DOM.

## Change Room

![Change Room target and implementation comparison](./design-qa-change-comparison.png)

- Preserves the approved warm clinical palette, left navigation, dense change metadata, exact old/new citations, and evidence-to-impact hierarchy.
- The implementation uses the shared product shell instead of reproducing target-only chrome. This keeps navigation and read-only identity consistent across every surface.
- Human authorization remains unavailable in the public walkthrough; the live control is replaced by a WorkOS sign-in route and explicit read-only explanation.

## Graph Briefing

![Graph Briefing target and implementation comparison](./design-qa-graph-comparison.png)

- Preserves the multi-column dependency graph, impact legend, selected-path evidence, confidence, rationale, and classification.
- The graph is horizontally scrollable inside its own bounded surface on narrow screens. A release QA failure exposed a min-content width leak; the graph container now has explicit `min-width: 0` containment and the Pixel 7 regression passes.
- The public view exposes the reviewed score and rationale but cannot accept or override an edge.

## Evidence Ledger

![Evidence Ledger target and implementation comparison](./design-qa-audit-comparison.png)

- Preserves the ledger framing, checksum-first export, approval semantics, and honest retention disclosure.
- WORM is never implied unless an existing Object Lock bucket is configured and the retention authorization succeeds.

## Result

The implementation matches the approved direction while using one responsive component system. Automated accessibility, contrast, navigation, state, and horizontal-overflow checks pass on desktop and mobile. The remaining visual difference is intentional: the public seeded tenant shows read-only policy and authentication boundaries instead of active governed controls.
