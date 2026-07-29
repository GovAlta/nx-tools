**Accessibility checks.** `react-app`/`angular-app`/`vue-app` (`@abgov/nx-adsp`) each wire an
axe-core accessibility check (`a11y.spec.ts`) into the generated Playwright e2e project. It runs
automatically as part of the normal `e2e` target — locally and in CI — so there's no separate
command to remember, and no reason to skip or delete it when running the existing e2e suite. It's
scoped to WCAG 2.1 A/AA, not axe's full default ruleset — a pass means the app clears that
compliance baseline, not that it's fully accessible; don't treat a green check as license to skip a
real review when one's warranted. When it fails, read each violation's `helpUrl` (printed in the
failure output) for the rule's specific remediation rather than guessing a fix from the violation ID
alone.
