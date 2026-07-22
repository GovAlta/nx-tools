### Pre-commit checks

A pre-commit hook runs `nx affected` lint/test/build against your staged changes before every
commit. Don't wait for it to fail: run the same check yourself after a meaningful chunk of work
(a completed feature/story-sized change, not after every individual edit) —

    npx nx affected -t {{TARGETS}} --base={{BASE}}

— so failures surface while you still have context, not as a batch at commit time. If the
pre-commit hook blocks a commit, fix what it reports rather than bypassing it with
`git commit --no-verify`.
