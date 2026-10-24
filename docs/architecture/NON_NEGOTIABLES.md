# Dokkit Non-Negotiables

**Status:** Binding for all product, design, and engine work  
**Authority:** Overrides local feature convenience when they conflict  
**Stage:** 1 of 12 — Lock the non-negotiables

## Purpose

Make Dokkit’s product boundaries enforceable in code review, copy, and runtime behaviour. Dokkit is a tool: responsive and interactively intelligent without becoming an employee, autonomous agent, or performance monitor.

## 1. Tool, not employee / agent

- Dokkit never takes initiative or starts a conversation.
- Dokkit never acts on the user’s behalf without an explicit, confirmable user action.
- No first-person product voice (“I scheduled…”, “I’ve moved…”, “Would you like me to…”).
- No agent, copilot, or assistant persona in UI, copy, or system prompts.

## 2. Understanding is not permission

- Semantic interpretation and capacity reasoning may propose.
- Only explicit user confirmation may create, mutate, complete, carry, skip, or delete work.
- Capture output remains a proposal until the user confirms it (“Dock it” or equivalent).
- Background jobs, sync, and learning may update models, but must not mutate the user’s plan without a user-facing confirmation path where the product contract requires one.

## 3. No productivity guilt or performance theatre

Forbidden in UI, notifications, empty states, and insights:

- Streaks, XP, points, badges, levels, leaderboards.
- Productivity percentages such as “you only completed X%”.
- “You’re behind”, “you failed”, or “overdue” as moral language for ordinary unfinished work.
- Confetti or celebration animations for task completion.
- Red failure styling for normal carry / incomplete states.

Unfinished work is work that still exists. Carry is the calm default.

## 4. Intelligence is reduced effort, not personality

- Adaptation appears as better fit, better estimates, and quieter days.
- Insights are rare, high-confidence, plain, impersonal, evidence-shaped, and always overridable.
- No “AI” badge theatre on ordinary actions.
- No unsolicited advice chat.

## 5. Honest state

- Never claim “saved”, “done”, or “synced” before persistence is confirmed.
- Pending, failed, and retry states must be visible and recoverable.
- Drafts are not cleared until success is confirmed.

## 6. Corpus and engine boundary

- The intelligence corpus is for evaluation and engineering only.
- The corpus must never be used as runtime nearest-sentence lookup.
- Draft corpus labels must never be release gates or quality claims.

## 7. Feature test — required before merge

Answer every question for each change:

1. Does it help the user understand what fits?
2. Does it reduce mental friction?
3. Does it require unnecessary metadata maintenance?
4. Does it make Dokkit feel like conventional productivity software or an agent?

If answer 4 is yes, reject or redesign the change.

## 8. Decision hierarchy

When decisions conflict, use this order:

1. User comprehension
2. Low friction
3. Time awareness
4. Clarity
5. Consistency
6. Visual polish
7. Technical convenience

Technical convenience must not dictate the user experience.

## 9. Enforcement

- Every PR must use the non-negotiables checklist in the repository PR template.
- CI runs `scripts/check-non-negotiables.mjs` against user-facing source under `app/`, `components/`, and `lib/`.
- The copy scan is a lightweight guard, not proof of permission correctness. Reviewers must still inspect plan mutations, confirmation boundaries, persistence handling, and corpus/runtime separation.
- Comments, tests, docs, and explicitly identified legacy/technical identifiers are not user-facing copy and may be excluded from the scan; exceptions must be narrow and documented.
- Any PR adding agent voice, guilt language, or silent plan mutation must be rejected.

## Scope of Stage 1

Policy, copy rules, PR gates, and light enforcement only. No UI redesign, new features, corpus growth, or Reality Check rewrite.
