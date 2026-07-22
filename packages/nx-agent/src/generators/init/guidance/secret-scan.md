### Secret scanning

A pre-commit hook scans your staged changes for committed credentials (API keys, tokens, private
keys) before every commit. You may have real secrets on hand mid-session — a token from
`gh auth token`, a value read from `.env`, a key provided for testing — that you might paste
literally if asked to "add a working example," in a way a human wouldn't as instinctively catch in
themselves. Reference an environment variable or a secrets manager instead — never a literal
value, even in a comment or test fixture. If the hook blocks a commit, remove the value and rotate
it if it was ever pushed anywhere; don't just delete the line and recommit.

Local credential files (`.env.local`, `*.pem`, `id_rsa`, etc.) are gitignored by default, so
they can't be staged accidentally — if you create a new kind of local secret file, add its pattern
to `.gitignore` too rather than relying on the scan above to catch it after the fact.
