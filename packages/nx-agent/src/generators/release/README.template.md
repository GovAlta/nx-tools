# Releases

Each file here is a **Release Artifact** — a durable, committed record of which features are
in scope for a versioned delivery.

The CI harness reads active release artifacts automatically to derive `artifact_scope` for each
iteration. Archive a release artifact once the delivery cycle closes.

Run `nx g @abgov/nx-agent:release "<name>"` to add a new release.
