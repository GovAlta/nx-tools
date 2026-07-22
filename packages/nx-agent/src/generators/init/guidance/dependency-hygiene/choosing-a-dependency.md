**Choosing a dependency.** Before adding anything, check whether an existing dependency already
covers the same need — two libraries doing the same job (two HTTP clients, two date-handling
libraries) adds bloat and inconsistency, not resilience. If a new one is genuinely needed,
confirm the package exists and check its current version — training data has a cutoff, and a
plausible-sounding name isn't a guarantee it's real. An actively-maintained library also likely
has capabilities and fixes a stale one doesn't. Check the license too: prefer permissive ones
(`MIT`, `Apache-2.0`, `BSD`, `ISC`); treat a missing license or a copyleft one (`GPL`, `AGPL`,
`LGPL`) as a stop-and-ask signal — these carry legal obligations, not engineering ones.
