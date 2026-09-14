---
project-docs-ancestors: [product-briefs:keystone-installer]
resolves: []
---

npm's trusted publishing is configured per package on the registry, so the package has to exist
before a publisher can be attached to it. That means one manual placeholder publish of the
`0.0.0` version this repository carries, before CI can publish anything — and it opens a window
between that publish and the first real release.

Two options, and the choice is which failure a curious colleague hits during that window:

- **Publish the placeholder to `latest` (the default).** `npx @abgov/keystone` resolves and runs a
  version that does nothing.
- **Publish it to a non-default tag.** `latest` is never a placeholder, but the bare invocation has
  no version to resolve until the first real release lands.

Not guessable, for two reasons. It is a judgment about which is the less confusing failure, which
belongs to whoever owns the package rather than to whoever implements it. And the second option's
consequence needs confirming rather than assuming: how npm resolves a package that has versions
but no `latest` tag should be checked at the time, not recalled.

Bounded: it does not block implementation, only the first publish. It also disappears permanently
once the first real release lands, so it is worth deciding cheaply rather than designing around.
