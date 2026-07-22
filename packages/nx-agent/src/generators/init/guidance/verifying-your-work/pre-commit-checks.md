**Pre-commit checks.** A hook runs `nx affected` lint/test/build against staged changes before
every commit. Run the same check yourself after a meaningful chunk of work — not after every
edit — using `npx nx affected -t {{TARGETS}} --base={{BASE}}`, so failures surface while you
still have context. If the hook blocks a commit, fix what it reports; don't bypass it with
`git commit --no-verify`.
