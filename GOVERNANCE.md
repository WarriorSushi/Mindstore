# Governance

MindStore is an open source project with a strong product vision, but it is not a governance-free project.

This document explains who steers the project, how major policy decisions are handled, and how that interacts with licensing, plugins, and commercial direction.

## Current Model

MindStore is currently maintainer-led.

That means:

- maintainers set roadmap priorities
- maintainers approve or reject pull requests
- maintainers define plugin/runtime contracts
- maintainers control branding, release process, and any future licensing transitions

## Why This Exists

MindStore is trying to balance several things at once:

- community trust
- a healthy plugin ecosystem
- long-term product quality
- future commercial sustainability

Those goals require explicit stewardship. Governance should be visible, not implied.

## What Contributors Can Expect

Contributors are welcome across:

- core product improvements
- plugins
- docs
- tests
- accessibility
- deployment and operational tooling

Maintainers will prefer work that:

- fits the documented plugin/runtime model
- includes docs
- preserves compatibility where practical
- strengthens the long-term product instead of only adding surface area

## Architectural Authority

The project may accept broad feature contributions, but maintainers retain final authority over:

- plugin SDK/runtime contracts
- public API contracts
- MCP behavior
- deployment mode assumptions
- licensing and trademark policy
- branch convergence strategy

## Licensing And Commercial Direction

MindStore is licensed under the [Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](./LICENSE). Each version converts to MIT two years after its release. See [LICENSING.md](./LICENSING.md) for the full explanation.

Future changes to licensing strategy are governance events and will be handled deliberately, not silently. See [LICENSING.md](./LICENSING.md).

Commercial offerings, hosted plans, support agreements, and trademark licenses are reserved to the maintainers unless explicitly delegated.

## Trademarks

Code rights and trademark rights are separate.

Use of the project name, logos, and official branding is governed by [TRADEMARKS.md](./TRADEMARKS.md).

## Contribution Origin

Contributors are expected to certify origin through the Developer Certificate of Origin process in [DCO.md](./DCO.md).

## Future Evolution

As the community grows, governance can become more formal. Likely future steps could include:

- named maintainers and owners by area
- a plugin ecosystem review process
- a public RFC or ADR workflow for major architectural changes
- a clearer commercial/open-source boundary document

For now, the priority is clarity and consistency rather than bureaucracy.
