**Reuse before reinventing.** Check whether logic already exists — in this codebase, or in a
well-established library — before writing it yourself. Bias toward a proven library over local
code even more strongly for security-sensitive logic (cryptography, auth, encoding, randomness):
a plausible-looking custom implementation is exactly where testing is least likely to surface a
subtle flaw. The same applies to repeated artifacts, not just logic — use an existing generator
(e.g. `nx g @abgov/nx-agent:domain-term`) instead of hand-authoring a file it would create; if a
genuinely new, repeated kind of artifact is needed that nothing generates yet, add a
workspace-local Nx generator rather than hand-authoring instances one at a time.
