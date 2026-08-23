---
title: "Cron expressions (automation schedules)"
type: reference
status: active
date: 2026-08-20
tags: [openagent, cron, automations, schedule, reference]
---

# Cron expressions (automation schedules)

Open Agent runs automations on a **cron schedule** — a compact 5-field expression
like `0 9 * * *` that means "every day at 09:00". It is not a secret key: the
`*` characters are wildcards that simply mean "every".

For almost every schedule you will not type this at all. The Automations
settings turn the expression into human choices (a preset dropdown, a guided
builder, or a blueprint template) and show a **"Means: …"** line that explains
the result in words. This page documents the expression itself for the rare
cases where you use the **Advanced (raw cron)** field.

## The five fields

A schedule is five values separated by spaces:

```
minute hour day-of-month month day-of-week
```

| # | Field | Allowed | Meaning |
| --- | --- | --- | --- |
| 1 | minute | `0–59` | minute of the hour |
| 2 | hour | `0–23` | hour of the day (24-hour) |
| 3 | day-of-month | `1–31` | day of the month |
| 4 | month | `1–12` | month of the year |
| 5 | day-of-week | `0–6` | day of the week, `0` = Sunday |

Open Agent uses the **5-field** form — there is no seconds field and no year
field.

## Operators

| Symbol | Meaning | Example |
| --- | --- | --- |
| `*` | every value | `0 9 * * *` — day, month, and weekday are "every" |
| `*/N` | every N steps | `*/15 * * * *` — every 15 minutes |
| `a,b` | a list | `0 9 * * 1,4` — Monday **and** Thursday |
| `a-b` | a range | `0 9 * * 1-5` — Monday through Friday |

## Copy-paste examples

| You want | Expression |
| --- | --- |
| Every minute | `* * * * *` |
| Every 15 minutes | `*/15 * * * *` |
| Hourly | `0 * * * *` |
| Every 2 hours | `0 */2 * * *` |
| Every day at 09:00 | `0 9 * * *` |
| Weekdays at 09:00 | `0 9 * * 1-5` |
| Monday and Thursday at 09:00 | `0 9 * * 1,4` |
| Weekends at 10:00 | `0 10 * * 0,6` |
| The 1st of each month at 09:00 | `0 9 1 * *` |

## Where the UI hides this for you

In order of "least typing first":

1. **Preset dropdown** — Every 15 minutes, Hourly, Daily, Weekdays, Weekly,
   Monthly. One click, no expression.
2. **Guided builder** ("Custom schedule…") — pick Every day / Every N minutes /
   Weekly / Monthly and fill in a time picker. A live **"Means: …"** line states
   the schedule in words (e.g. "Weekdays (Mon–Fri) at 09:00").
3. **Blueprint templates** — ready-made automations where the schedule comes
   with the template; you only pick the time and the repeat days.
4. **Advanced (raw cron)** — the only place the expression is shown or typed.
   Use it for schedules the builder cannot express (lists like `1,4`, weekend
   ranges like `0,6`, or a specific day of month).

A malformed expression is rejected with a field error; the **"Means: …"** line
is the confirmation that the expression says what you intended.

## Notes

- The schedule engine evaluates the expression once per tick while Obsidian is
  open; a missed run (Obsidian closed) is offered when you return.
- The automations list and the chat `cronjob` tool accept the same 5-field
  expression, so anything you can describe here you can also ask the agent for
  in chat ("every Monday and Thursday at 9").
