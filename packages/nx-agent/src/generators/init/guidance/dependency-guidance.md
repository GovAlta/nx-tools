### Choosing dependencies

Before adding a new dependency, verify it's still actively maintained and widely adopted — your
training data has a cutoff, and a package's state (or the wider ecosystem's preferred choice) may
have moved on since then. Check the registry for the current latest version rather than defaulting
to a version number you recall as typical, and don't propose a package that's since been
deprecated or superseded by something else.

Check the license before adding anything: prefer permissive licenses (`MIT`, `Apache-2.0`,
`BSD`, `ISC`). Treat a missing/unlicensed package, or a copyleft license (`GPL`, `AGPL`,
`LGPL`), as a stop-and-ask signal rather than something to resolve yourself — these carry
share-alike obligations (and for AGPL, obligations triggered by network use even without
traditional distribution) that are a legal/business decision, not an engineering one.
