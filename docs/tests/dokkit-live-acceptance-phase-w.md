# Dokkit live acceptance pack — Phase W

**Purpose:** check current end-to-end Capture behaviour in the running Dokkit app, not just the engine's internal output.

This pack is intentionally cross-domain. It is not a trade-specific grammar test. The 24 new automated Phase W replay cases are diagnostic: they compare typed input with the deterministic fixed-transcript speech path and report semantic differences. They do **not** treat machine-generated labels as gold truth or claim that a case passed semantically just because the test runner completed.

## How to run the live checks

1. Open `dokkit.space/app` and use the normal Capture input.
2. Run one sentence at a time. Start a fresh capture for each test unless the test explicitly says it is a follow-up.
3. Check the proposed task text, location, date/time, and whether Dokkit acts, answers, preserves, or asks for clarification.
4. Do not confirm a task if the proposal has silently changed the meaning. Record the exact output instead.
5. For a speech check, say the same sentence aloud and compare the result with typed input. This tests the live speech path too; it is not an isolated acoustic-recognition benchmark.

## Tier 1 — everyday capture and basic structure

| # | Say or type | What to check |
|---|---|---|
| 1 | `Remind me to send the invoice to Priya tomorrow at 9am.` | One sensible task; recipient and time are not lost. |
| 2 | `I need to call Jordan to get the measurements for the downpipes for Angela Place.` | Primary action remains calling Jordan; purpose remains measurements/downpipes; Angela Place is not swallowed into the title or mistaken for the person. |
| 3 | `I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.` | Both material items and quantities survive; Bunnings is the supplier/location, not a replacement for the item text. |
| 4 | `Drop off clips to 64 Grace James Road in Pukekohe at 4pm today.` | Drop-off action, address, time and today are retained. |
| 5 | `Quote for Korohata Terrace.` | Creates a new quote-related task; it must not inherit unrelated Sika/material-pickup content from an earlier capture. |
| 6 | `Call the supplier after lunch.` | Captures the action without inventing a precise clock time or a location. |
| 7 | `Prepare a one-page summary of the Q3 numbers for tomorrow morning.` | Deliverable, subject and approximate time all survive. |
| 8 | `Find the leak under the kitchen sink and take a photo before touching anything.` | The two actions and the sequencing/constraint are not collapsed into an unrelated task. |
| 9 | `Practice the new chord changes for ten minutes after dinner.` | Action and duration survive; the system should not reinterpret the sentence as a location. |
| 10 | `Reproduce the login bug on a clean account and record the exact error message.` | Reproduction and evidence capture both survive. |

## Tier 2 — time, corrections, conditions and references

| # | Say or type | What to check |
|---|---|---|
| 11 | `Set the reminder for 8am, no wait, 9am.` | The final time is 9am; 8am is not retained as the active value. |
| 12 | `Email Chris on Wednesday, no wait, Thursday.` | Thursday wins; the sentence is not misread as a location or two unrelated tasks. |
| 13 | `Move it to Monday at 3pm.` | Run immediately after creating a clear task. It should update that task's date/time and preserve its title/location. |
| 14 | `Change the time to 3pm, but leave the date alone.` | Run as a follow-up to a task with a date. Time changes while date and task identity remain unchanged. |
| 15 | `Send the revised proposal to Lee after finance signs off.` | The approval dependency is retained; do not silently turn the condition into an already-approved fact. |
| 16 | `If the first flight is delayed, move the airport pickup to the updated arrival time.` | Conditional/fallback meaning is retained; no invented fixed arrival time. |
| 17 | `Leave that task unchanged and create a separate task to renew the insurance next month.` | A new task is created; the existing task is not modified or contaminated. |
| 18 | `Move the other one to Friday, not the one we just discussed.` | If there are multiple plausible tasks, Dokkit should ask which one or preserve the input rather than silently editing the focused task. |
| 19 | `Leave it at the front desk — actually, put it in the parcel locker.` | The corrected destination wins if context is sufficient; otherwise preserve/clarify rather than acting on the rejected destination. |
| 20 | `Compare the train and bus options, but do not book anything until I confirm.` | Comparison intent is captured without treating the sentence as permission to book. |

## Tier 3 — false-action and ambiguity safety

| # | Say or type | What to check |
|---|---|---|
| 21 | `I bought milk and bread already, so do not add them to the shopping list.` | Must not create a task to buy milk or bread or mutate a list as though the user requested it. |
| 22 | `The electricity bill was paid this morning; nothing else is needed.` | Past-tense report should not become a new payment task. |
| 23 | `There is a damp patch spreading across the laundry ceiling again.` | This is an observation, not automatically a task with invented action wording. |
| 24 | `Maybe the timeout is caused by the proxy, but we have not confirmed that.` | Uncertainty remains uncertainty; no ungrounded claim that the proxy is the cause. |
| 25 | `Why does the same melody sound different when played in another key?` | Information question should not silently become a task. |
| 26 | `Does this paragraph actually answer the question, or does it wander off topic?` | Treat as a question/evaluation request, not a fabricated commitment to rewrite the paragraph. |
| 27 | `Do not send the message unless I approve the final wording.` | The negative/conditional restriction must survive; must not become an unconditional “send message” task. |
| 28 | `The appointment went well yesterday and there is no follow-up planned.` | Past report with explicit no-follow-up should not create a new task. |
| 29 | `Ask Noor to recalibrate the fluxgate after the firmware swap.` | Unknown vocabulary must not cause unrelated action/object/location substitution. A reasonable task should preserve the unusual term exactly. |
| 30 | `I need to call Jordan about the Smith Street flashing.` Then: `Actually, make that Monday.` | First capture is one call task; follow-up changes only its date. It must not replace the title or location with “Monday”. |

## Record results

For each case, note:

- **Outcome:** created / updated / answered / clarified / preserved / wrong action.
- **Task text:** exact proposed title.
- **Location:** exact proposed location, or “none”.
- **Date/time:** exact displayed value, or “none”.
- **Input path:** typed or spoken.
- **Severity:** pass / minor loss / wrong meaning / unsafe mutation.

Prioritise **wrong meaning** and **unsafe mutation** over cosmetic wording. A sentence being accepted by Capture is not enough: the resulting task and fields must preserve the user's meaning. Do not execute any destructive external action during this test; this pack is for observing Dokkit's proposal and local task behaviour.

## Current limitations to keep in mind

- A fixed-transcript automated replay does not measure microphone or acoustic speech-recognition accuracy.
- The development corpus is still primarily draft-annotated; diagnostic mode parity is not a semantic accuracy score.
- Native Android now supports authenticated Today capture and Start / Stop / Complete actions, but its lifecycle actions do not yet share the web offline mutation queue. For the broad language tests above, use the main web app unless specifically comparing native capture.
