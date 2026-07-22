**Secrets.** A pre-commit hook scans staged changes for credentials, and local credential files
(`.env.local`, `*.pem`, `id_rsa`) are gitignored by default — but you may have a real secret on
hand mid-session (a `gh auth token`, a `.env` value) that you'd paste less carefully than a human
would if asked to "add a working example." Reference an environment variable or secrets manager,
never a literal value — in a comment, a test fixture, or a log line, even indirectly through a
variable that holds one, since static scanning of the diff won't catch that. If the hook blocks a
commit, remove the value and rotate it if it was ever pushed anywhere.
