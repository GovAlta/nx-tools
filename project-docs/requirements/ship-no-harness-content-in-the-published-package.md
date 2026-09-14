---
title: Ship no harness content in the published package
id: req-011
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: the packed contents are compared against an expected-file manifest maintained in this repository, not against the allowlist that produced them
    examples:
      - "Given: an expected-file manifest listing exactly what this package ships;
         When: the package is packed and its contents enumerated;
         Then: the two sets are equal, so the assertion cannot be satisfied by an allowlist that is
         itself wrong"
    questions: []
  - rule: a widening entry inside the allowlist is caught
    examples:
      - "Given: an allowlist entry that is a directory or a glob, and a new file added under it;
         When: the packed contents are compared against the expected-file manifest;
         Then: the comparison fails naming that file, because the failure this guards against is the
         allowlist silently absorbing something rather than admitting nothing"
    questions: []
  - rule: the comparison runs on the path that publishes, not only in the unit-test suite
    examples:
      - "Given: a release of this package;
         When: it is published;
         Then: the packed-contents comparison has run as part of that path, since a gate that does
         not run where the publish happens does not prevent the publish"
    questions: []
  - rule: the manifest declares nothing that installs code alongside it
    examples:
      - "Given: the published package's manifest;
         When: its dependency fields are read;
         Then: dependencies, bundled, optional and peer dependencies are all empty, so the code path
         that handles a credential carries no transitive surface"
    questions: []
  - rule: the package is published with public access, so a consumer needs no registry credential
    examples:
      - "Given: the published package;
         When: its registry access level is read;
         Then: it is public, so no consumer needs registry configuration for this scope — which is
         separate from the source access a fetch needs"
    questions: []
questions: []
---

## Rationale

Fetching rather than bundling is what lets this ship before the source repository separates its
general content from its organization-specific layer. That ordering only holds while the package
genuinely carries nothing, so "carries no harness content" is the safety claim the whole approach
rests on.

A claim that rests on care is a claim that lapses. The other packages in this suite publish without
an explicit file list, which is fine for a library whose entire source is meant to ship; here the
list is the control, and a mechanically checkable one.

The check has to compare against what this package expects to ship rather than against the list
that produced the output, or it proves only that the packing tool works. The realistic way harness
content — or a credential file, or local configuration — reaches a public tarball is a directory or
glob entry quietly widening, which is invisible to any check that treats the list as the oracle.

Zero dependencies is part of the same control rather than a packaging preference: this is a
credential-free, publicly installable binary that then reads an access token, so a later change
adding one small dependency is a security decision.

The claim is also what keeps the published artifact clear of a distribution whose contents have not
been reviewed for public release, which is a decision belonging to the source repository and not to
this package.
