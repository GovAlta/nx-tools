**Linear history.** Rebase a branch onto the latest base rather than merging the base into it,
where the workflow allows — a merge commit in the branch can carry into the shared branch too,
depending on the merge method used at integration. Linear history is what makes `git bisect` and
`git revert` reliable. Match whichever merge method (squash, rebase, merge commit) the repo
already uses consistently.
