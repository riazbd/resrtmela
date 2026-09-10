# The prompt to open the next session with

Copy the block below into a fresh Claude Code session in `C:\projects\resorts`.
It is deliberately short: it points at the documents rather than repeating them,
because a prompt that restates the plan will drift from the plan.

---

```
Read docs/superpowers/plans/2026-09-11-phase-1-guests-leave.md in full, and the
spec it links, before doing anything.

Then execute it task by task, using the superpowers:subagent-driven-development
skill. TDD throughout: red first, and show me the failing output before the fix.

Stop and ask me before:
  - deleting anything the plan does not name
  - deploying
  - starting phase 2

Work in Bangla with me. Code and commits in English.
```

---

## If you would rather go one task at a time

Same first line, then:

```
Do Task 1 only, then stop and show me the diff.
```

## What to expect

Nine tasks, 52 steps. Tasks 1–2 build a forgot-password flow; 3–8 remove the
guest surface; 9 runs the whole suite and stops short of deploying.

The API suite takes about 22 minutes and must run alone — it shares one test
database, and two runs corrupt each other. Only Task 9 runs it.

## If the session seems lost

It has not read the plan. Say so plainly:

```
Read docs/superpowers/plans/2026-09-11-phase-1-guests-leave.md before continuing.
```

## The one thing worth checking yourself

Task 6 removes `ROLE.GUEST`. Before that lands, make sure Tasks 1 and 2 actually
work — ask for a screenshot of the login page showing the "Forgot password?"
link. Removing OTP without a working replacement would lock a staff member out
with no way back in, and the point of doing them in that order is that this
cannot happen.
