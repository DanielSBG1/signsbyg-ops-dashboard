# Chunk 1 — Workflow Build Guide for HubSpot UI

**For:** Claude Code (or human) building in HubSpot Automation → Workflows
**Portal:** 45962246
**Business hours:** Mon–Fri 8:00 AM – 6:00 PM America/Chicago
**Properties already created via API** — do NOT recreate them.

---

## Pre-flight check

Before building any workflow, verify in Settings → Properties → Contact:
- Group "SBG Sales Process" exists with 11 properties
- `lead_assigned_at`, `first_attempt_at`, `speed_to_lead_missed` etc. are all there

Also verify in Settings → Properties → Deal:
- Group "SBG Sales Process" exists with 3 properties
- `lead_assigned_at`, `first_attempt_at`, `minutes_to_first_attempt`

---

## WF-01: SBG Lead Routing

**Type:** Contact-based workflow
**Re-enrollment:** OFF
**Goal:** None

### Enrollment trigger

**ALL of these conditions:**
- `hs_analytics_source` is equal to `PAID_SOCIAL`
- `hs_object_source_label` is equal to `FORM`
- `hubspot_owner_id` is unknown

> This ensures only inbound form leads enroll, not CRM-created or extension-created contacts. The unknown owner check prevents double-routing if Daniel manually creates a contact.

### Steps (build in this exact order)

**Step 1 — Branch: Business hours**
- Action: If/then branch
- Condition: "Time of day" → Monday–Friday, 8:00 AM – 6:00 PM, America/Chicago
- YES branch → Set property: `business_hours_lead` = `true`
- NO branch → Set property: `business_hours_lead` = `false`
- Both branches merge back to Step 2

**Step 2 — Branch: Budget ≥ $50K**
- Action: If/then branch
- Condition: `what_is_your_estimated_budget_for_this_project` **contains any of:** `50k`, `50,000`, `50K`, `$50k`, `$50,000`

**YES branch (≥$50K):**
- Set property: `hubspot_owner_id` = `Daniel Garnier` (1977160866)
- Set property: `lead_routing_reason` = `budget_50k`
- Go to Step 3

**NO branch (rotation):**
- Action: "Rotate record to owner"
  - Owners: Alex Temple (761399091), Brailin Matos (162277230), Amr Taher (167855984)
  - Distribution: Equal
  - If available: exclude out-of-office owners (if supported, otherwise skip)
- Set property: `lead_routing_reason` = `rotation`
- Go to Step 3

**Step 3 — Capture original owner**
- Set property: `original_owner_id` = `{{hubspot_owner_id}}`
  - (Use "Copy property value" action: source = `hubspot_owner_id`, target = `original_owner_id`)

**Step 4 — Timestamp assignment**
- Set property: `lead_assigned_at` = "Date of step"
  - (This is the workflow action "Set date property value → Use the date the contact enters this step")

**Step 5 — Create task**
- Action: Create task
- Title: `FIRST TOUCH — call within 15 min — {{firstname}} {{lastname}}`
- Type: Call
- Priority: High
- Due date: +15 minutes from now
- Assigned to: Contact owner
- Body:
```
📞 {{phone}}
✉️ {{email}}
🏢 {{company}}
💰 Budget: {{what_is_your_estimated_budget_for_this_project}}
📅 Timeline: {{project_timeline_}}
✅ Ready if price fits: {{are_you_ready_to_move_forward_if_pricing_fits_your_budget}}
📍 {{address}}
```

**Step 6 — Slack notification (to owner DM)**
- Action: Send Slack notification
- Send to: Contact owner (DM)
- Message:
```
🟢 New lead → {{hubspot_owner_id}}
{{firstname}} {{lastname}} · {{company}}
📞 {{phone}}   ✉️ {{email}}
Budget: {{what_is_your_estimated_budget_for_this_project}} · Timeline: {{project_timeline_}}
Ready if price fits: {{are_you_ready_to_move_forward_if_pricing_fits_your_budget}}
⏱ Clock started {{lead_assigned_at}} — call inside 15 min through HubSpot Calling.
{{record_link}}
```

**Step 7 — Branch: After-hours handling**
- Condition: `business_hours_lead` is equal to `false`

**YES (after hours):**
- Send SMS (if enabled): Template `SBG-01-AH-v1` (after-hours acknowledgement)
  - If SMS not enabled → Send email: Template `SBG-01-AH-email-v1`
- Update the task from Step 5: set due date to next business day 8:15 AM
  - (If you can't update the task, create a second task due 8:15 AM next business day and delete the 15-min one)

**NO (business hours):** End workflow.

---

## WF-02: SBG First-Attempt Capture

**Type:** Contact-based workflow
**Re-enrollment:** ON (re-enroll when `notes_last_contacted` is known)
**Goal:** None

### Enrollment trigger

**ALL of these conditions:**
- `lead_assigned_at` is known
- `notes_last_contacted` is known
- `first_attempt_at` is unknown

> The re-enrollment + "first_attempt_at is unknown" makes this fire exactly once: the first time a rep logs any contact after assignment.

### Steps

**Step 1 — Copy timestamp**
- Action: Copy property value
- Source: `notes_last_contacted`
- Target: `first_attempt_at`

**Step 2 — Derive channel and method**

**Option A — With Operations Hub custom code:**
- Action: Custom code
- Code should:
  1. Fetch the most recent engagement associated to this contact after `lead_assigned_at`
  2. Map engagement type:
     - `CALL` → set `first_attempt_channel` = `call`
       - If `hs_call_source` = `VOIP` → set `first_attempt_logged_via` = `hubspot_calling`
       - Else → set `first_attempt_logged_via` = `manual`
       - Copy `hs_call_disposition` → `first_attempt_outcome`
     - `EMAIL` → set `first_attempt_channel` = `email`, `first_attempt_logged_via` = `hubspot_email`
     - `COMMUNICATION` (SMS) → set `first_attempt_channel` = `text`, `first_attempt_logged_via` = `hubspot_sms`

**Option B — Without custom code (Starter/Pro):**
- Create 3 sibling workflows triggered on:
  1. Call logged → if `first_attempt_channel` is unknown → set `first_attempt_channel` = `call`, `first_attempt_logged_via` = `hubspot_calling`
  2. Email sent → if `first_attempt_channel` is unknown → set `first_attempt_channel` = `email`, `first_attempt_logged_via` = `hubspot_email`
  3. SMS sent → if `first_attempt_channel` is unknown → set `first_attempt_channel` = `text`, `first_attempt_logged_via` = `hubspot_sms`

**Step 3 — Do NOT clear speed_to_lead_missed**
- No action needed. If it's already true, a late attempt doesn't undo the miss.

---

## WF-03: SBG Speed-to-Lead Escalation

**Type:** Contact-based workflow
**Re-enrollment:** OFF
**Goal criteria:** `first_attempt_at` is known (unenrolls when attempt is made)

### Enrollment trigger

**ALL of these conditions:**
- `lead_assigned_at` is known
- `business_hours_lead` is equal to `true`

### Steps

**Step 1 — Delay 15 minutes**
- Action: Delay → 15 minutes

**Step 2 — Check: was attempt made?**
- If/then branch: `first_attempt_at` is unknown

**YES (no attempt after 15 min):**
- Set property: `speed_to_lead_missed` = `true`
- Send Slack notification to: Contact owner + Daniel Garnier
  - Message:
```
⚠️ 15 min, no attempt — {{firstname}} {{lastname}} ({{phone}}) assigned to {{hubspot_owner_id}} at {{lead_assigned_at}}. Call now. {{record_link}}
```

**NO (attempt was made):** End workflow (goal already met).

**Step 3 — Delay 15 more minutes** (30 min total from assignment)
- Action: Delay → 15 minutes

**Step 4 — Check again: was attempt made?**
- If/then branch: `first_attempt_at` is unknown

**YES (still no attempt after 30 min):**
- Set property: `speed_to_lead_reassigned` = `true`

- **Sub-branch:** Check if original was Daniel ($50K lead)
  - Condition: `lead_routing_reason` is equal to `budget_50k`
  - **YES (Daniel's $50K lead):** Do NOT reassign. Send Slack to Daniel again:
```
⚠️⚠️ 30 min, STILL no attempt — {{firstname}} {{lastname}} ({{phone}}). This is your $50K+ lead. {{record_link}}
```
  - **NO (rotation lead):** Reassign:
    - Action: Rotate record to owner (exclude `original_owner_id` — select the other 2 reps)
    - Set property: `lead_routing_reason` = `reassigned_miss`
    - **Do NOT reset** `lead_assigned_at` (the miss stays on the original owner's clock)
    - Create new task: `FIRST TOUCH — call within 15 min — {{firstname}} {{lastname}}`, due +15 min, assigned to new owner
    - Send Slack to new owner + Daniel:
```
🔁 Reassigned → {{hubspot_owner_id}}: {{firstname}} {{lastname}} ({{phone}}). 30 min unattempted. Original owner: {{original_owner_id}}. {{record_link}}
```

**NO (attempt was made):** End workflow.

---

## WF-03b: SBG Speed-to-Lead Escalation (After Hours)

**Identical to WF-03 but:**
- Enrollment: `lead_assigned_at` is known AND `business_hours_lead` is equal to `false`
- Step 1: Instead of "Delay 15 minutes", use **"Delay until date"** → next business day 8:15 AM America/Chicago
- Step 3: Delay 15 more minutes (8:30 AM)
- Everything else identical

---

## WF-04: Arif Cleanup (one-time) — ✅ ALREADY DONE

The API redistributed 470 of Arif's contacts:
- Alex: +157
- Brailin: +157
- Amr: +156
- All tagged `lead_routing_reason` = `manual`

**Still need to do manually:**
1. Go to Settings → Integrations → Facebook Lead Ads → check default owner. If it's Arif, change to one of the active reps or remove.
2. Go to Automation → Workflows → search for "assign", "rotate", "owner". Disable any workflow that assigns to Arif.

---

## Speed-to-Lead Dashboard

Create in Reports → Dashboards → Create dashboard → name: **"SBG Sales Process"**

### Tile 1: Median minutes to first attempt — by owner
- Report type: Contact
- Filter: `lead_assigned_at` is known, `business_hours_lead` = true
- Measure: `minutes_to_first_attempt` (median)
- Group by: `original_owner_id`
- Date range: This week
- **Target: < 15 minutes**

### Tile 2: % attempted inside 15 min — by owner
- Report type: Contact
- Filter: `lead_assigned_at` is known
- Measure: Count of contacts where `minutes_to_first_attempt` ≤ 15 / Count of all contacts with `lead_assigned_at` known
- Group by: `original_owner_id`
- **Target: > 85%**

### Tile 3: Unattempted right now
- Report type: Contact list
- Filter: `lead_assigned_at` is known AND `first_attempt_at` is unknown
- Sort by: `lead_assigned_at` ascending
- Columns: Name, Owner, Phone, Lead assigned at, Budget
- **This tile should be empty most of the day**

### Tile 4: Misses this week — by owner
- Report type: Contact
- Filter: `speed_to_lead_missed` = true
- Measure: Count
- Group by: `original_owner_id`
- Date range: This week

### Tile 5: Reassignments this week
- Report type: Contact
- Filter: `speed_to_lead_reassigned` = true
- Measure: Count
- Date range: This week

### Tile 6: Manual-log rate — by owner
- Report type: Contact
- Filter: `first_attempt_at` is known
- Measure: Count where `first_attempt_logged_via` = `manual` / Total count
- Group by: `original_owner_id`
- **The honesty metric**

### Tile 7: First-attempt outcome mix
- Report type: Contact
- Filter: `first_attempt_at` is known
- Measure: Count
- Group by: `first_attempt_outcome`
- **Connected % = contact rate. Target > 60% day one.**

### Tile 8: Routing mix
- Report type: Contact
- Filter: `lead_assigned_at` is known
- Measure: Count
- Group by: `lead_routing_reason`
- **Sanity check: ≥$50K leads should show under "Budget ≥ $50K → Daniel"**

---

## Acceptance Test Checklist (Friday Sep 11)

Run these 4 tests in order:

- [ ] **Test 1 — Normal lead:** Submit Meta form → contact created → owner assigned within 60s → `lead_assigned_at` populated → `lead_routing_reason` = `rotation` → Task "FIRST TOUCH" appears → Slack DM reaches owner
- [ ] **Test 2 — Missed lead:** Submit and don't call → at 15 min `speed_to_lead_missed` = true, ⚠️ Slack fires → at 30 min owner changes, `speed_to_lead_reassigned` = true, `original_owner_id` shows first rep
- [ ] **Test 3 — $50K lead:** Submit with budget containing "$50k" → owner = Daniel → `lead_routing_reason` = `budget_50k`
- [ ] **Test 4 — After hours (7 PM):** Submit at 7 PM → after-hours text/email arrives within 2 min → task due 8:15 AM next business day → no ⚠️ fires overnight
- [ ] **Dashboard:** All 4 test contacts show correctly on the Speed-to-Lead dashboard
- [ ] **Arif check:** Zero contacts created after July 1 still assigned to Arif
