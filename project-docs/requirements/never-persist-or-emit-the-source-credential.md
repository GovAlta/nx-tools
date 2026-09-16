---
title: Never persist or emit the source credential
id: req-012
project-docs-ancestors: [product-briefs:keystone-installer, features:keystone-bootstrap-installer]
resolves: []
rules:
  - rule: the recorded source is normalized to a bare repository identity, carrying no credential
    examples:
      - "Given: a fetch performed against a remote URL that embeds an access token;
         When: provenance is recorded;
         Then: the recorded value is the bare repository identity, and the record contains no part of
         the token"
    questions: []
  - rule: no diagnostic output carries the credential, including the remediation a failed fetch prints
    examples:
      - "Given: a fetch that fails while a token is present in the environment;
         When: the failure is reported;
         Then: the output names the access required and how to obtain it, and contains no part of
         the token, because this is exactly where a transport error would have echoed it"
    questions: []
  - rule: the fetch cache holds no credential
    examples:
      - "Given: a completed fetch that populated the cache;
         When: the cache's own configuration is read;
         Then: it carries no credential-bearing remote, so a cache that outlives the run does not
         outlive the secret"
    questions: []
  - rule: what the delegated tool receives is passed deliberately rather than inherited
    examples:
      - "Given: an upgrade that spawns the harness's own tool while a token is present;
         When: the tool is spawned;
         Then: whatever it receives was chosen explicitly, so the token is not in its environment by
         accident"
    questions:
      - "Does the delegated tool need source access of its own? If it does, this is a deliberate
         pass-through rather than something to withhold, and the rule states which."
questions: []
---

## Rationale

Two other requirements in this set actively push fetch-derived strings toward places a secret must
never reach, and neither of them is wrong to do so — which is why the constraint belongs in one
requirement rather than as a caveat on each.

Recording provenance means writing the source it came from into a file that is committed by
construction. Reporting a failed fetch means printing a remediation at exactly the moment a
transport error would have echoed a tokenized URL. A reused cache means a clone's own configuration
outliving the run that made it. Each of those is the standard way an access token ends up at rest
in a repository or a log.

It is stated as its own requirement because the failure is silent, uniform across every route, and
not recoverable after the fact: a token committed to a public project is disclosed whether or not
anyone notices, and rotating it is the only remedy.
