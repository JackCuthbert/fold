<!-- The commit message is the release note: short, and written for
     someone deciding whether to upgrade. This body is the opposite: the
     place for everything that doesn't belong in `git log`. See
     CONTRIBUTING.md. -->

**What this changes, and why**

**How it was verified.** The case that fails without this change, and what
you ran.

**Anything considered and rejected?** Worth a line; it saves the next
person re-treading it.

---

- [ ] `bun run lint`, `fmt`, `typecheck`, `knip` and `test` all pass
- [ ] Specs in `docs/specs` updated, if behaviour changed
- [ ] Commit subject reads as a release note, and its type is right (the type decides the version bump)
