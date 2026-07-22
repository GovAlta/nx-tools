**Reuse before reinventing.** Check whether logic already exists — in this codebase, or in a
well-established library — before writing it yourself. Bias toward a proven library over local
code even more strongly for security-sensitive logic (cryptography, auth, encoding, randomness):
a plausible-looking custom implementation is exactly where testing is least likely to surface a
subtle flaw.
