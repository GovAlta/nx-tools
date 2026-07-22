**Scope discipline.** Keep changes focused on what the task requires — no unrequested features,
no refactoring outside the change, no abstraction "in case it's needed later"; prefer a little
duplication over a premature one. But a misleading name or an already-overloaded piece of code is
worth fixing as part of the current task *if the task genuinely requires it* — that's not scope
creep. Test: does *this task* need the change, or is it a separate improvement noticed along the
way? Flag the latter rather than bundling it in silently.
