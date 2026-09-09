# Claude Co-Work Prompt — Chunk 1 Speed-to-Lead Workflows

**Copy this entire prompt into Claude Co-Work while you have HubSpot open in the browser.**

---

## Context

I'm building a Speed-to-Lead sales process in HubSpot portal 45962246 for Signs By G. The API already created:
- 11 contact properties in group "SBG Sales Process" (lead_assigned_at, first_attempt_at, first_attempt_channel, first_attempt_logged_via, first_attempt_outcome, speed_to_lead_missed, speed_to_lead_reassigned, original_owner_id, lead_routing_reason, business_hours_lead, minutes_to_first_attempt)
- 3 deal mirror properties (lead_assigned_at, first_attempt_at, minutes_to_first_attempt)
- 4 workflow skeletons (disabled) that need finishing

Business hours: Mon–Fri 8:00 AM – 6:00 PM America/Chicago.

Reps in rotation: Alex Temple (761399091), Brailin Matos (162277230), Amr Taher (167855984).
$50K+ leads go to: Daniel Garnier (1977160866).

## What I need you to help me build

Guide me step-by-step through finishing each workflow in the HubSpot UI. Tell me exactly what to click, what to select, and what to type. Wait for me to confirm each step before moving to the next.

---

### WORKFLOW 1: WF-01 · SBG Lead Routing (ID: 45065788)

This workflow already has enrollment criteria (PAID_SOCIAL + FORM + no owner) and a basic "set business_hours_lead = true" action. I need to rebuild the actions to match this exact flow:

**Open the workflow:** Go to Automation → Workflows → find "WF-01 · SBG Lead Routing" → click to edit.

**Delete the existing action** (the simple set property). We're rebuilding from scratch.

**Build these steps in order:**

1. **If/then branch: Business hours**
   - Add action → "If/then branch"
   - Condition: Click "Set condition" → choose "Is happening during a specific time" or "Day and time"
   - Set: Monday through Friday, 8:00 AM to 6:00 PM, timezone America/Chicago
   - YES branch: Add action → "Set contact property" → `business_hours_lead` → `true`
   - NO branch: Add action → "Set contact property" → `business_hours_lead` → `false`
   - After both branches, they should merge back to the next step

2. **If/then branch: Budget ≥ $50K**
   - Add action → "If/then branch"
   - Condition: Contact property `what_is_your_estimated_budget_for_this_project` → "contains any of" → type: `50k`, `50,000`, `50K`, `$50k+`
   - **YES branch ($50K+):**
     - Set contact property → `hubspot_owner_id` → select "Daniel Garnier"
     - Set contact property → `lead_routing_reason` → `budget_50k`
     - (Skip to step 4 — connect to the "Set original_owner_id" step)
   - **NO branch (rotation):**
     - Add action → "Rotate record to owner"
     - Select owners: Alex Temple, Brailin Matos, Amr Taher
     - Distribution: Equal/even
     - Set contact property → `lead_routing_reason` → `rotation`
     - (Continue to step 3)

3. **Copy owner to original_owner_id**
   - Add action → "Copy property value"
   - Source: `hubspot_owner_id` (Contact owner)
   - Target: `original_owner_id`

4. **Set lead_assigned_at**
   - Add action → "Set contact property"
   - Property: `lead_assigned_at`
   - Value: Choose "Date of step" or "Timestamp" (the moment the contact reaches this step)

5. **Create task**
   - Add action → "Create task"
   - Title: `FIRST TOUCH — call within 15 min — {{firstname}} {{lastname}}`
   - Task type: Call
   - Priority: High
   - Due date: In 15 minutes
   - Assigned to: Contact owner
   - Notes/body:
   ```
   📞 {{phone}}
   ✉️ {{email}}
   🏢 {{company}}
   💰 Budget: {{what_is_your_estimated_budget_for_this_project}}
   📅 Timeline: {{project_timeline_}}
   ✅ Ready: {{are_you_ready_to_move_forward_if_pricing_fits_your_budget}}
   ```

6. **Slack notification**
   - Add action → "Send Slack notification"
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
   - Also send a copy to the team lead-alerts channel

7. **If/then branch: After-hours handling**
   - Condition: `business_hours_lead` is equal to `false`
   - **YES (after hours):**
     - If HubSpot SMS is enabled: Send SMS using template "SBG-01-AH-v1"
     - If SMS not available: Send email using template "SBG-01-AH-email-v1"
     - The after-hours message should say something like: "Thanks for reaching out to Signs By G! We received your inquiry and a team member will call you first thing tomorrow morning at 8 AM. If this is urgent, reply to this message."
   - **NO (business hours):** End workflow

8. **Save the workflow** but keep it DISABLED until testing.

---

### WORKFLOW 2: WF-02 · SBG First-Attempt Capture (ID: 45065795)

This already has enrollment criteria and a copy property action. Verify:
- Enrollment: `lead_assigned_at` known AND `notes_last_contacted` known AND `first_attempt_at` unknown
- Re-enrollment: ON (triggered by `notes_last_contacted` changes)
- Step 1: Copy `notes_last_contacted` → `first_attempt_at` ← already built

**Add these steps after the copy:**

2. **If/then branch: Determine channel**
   - This is the tricky part. Best approach depends on your HubSpot tier:

   **If you have Operations Hub (custom code):**
   - Add "Custom code" action
   - The code should look at the most recent engagement after `lead_assigned_at`
   - Map: CALL → `first_attempt_channel` = `call`, EMAIL → `email`, SMS → `text`
   - Map: VOIP source → `first_attempt_logged_via` = `hubspot_calling`, else `manual`

   **If you DON'T have Operations Hub:**
   - Skip this step in WF-02
   - Instead, create 3 separate small workflows:
     - "WF-02a · Call Channel Capture": Triggered on "Call logged" → if `first_attempt_channel` is unknown → set to `call`, set `first_attempt_logged_via` = `hubspot_calling`
     - "WF-02b · Email Channel Capture": Triggered on "Email sent" → if `first_attempt_channel` is unknown → set to `email`, set `first_attempt_logged_via` = `hubspot_email`
     - "WF-02c · SMS Channel Capture": Triggered on "SMS sent" → if `first_attempt_channel` is unknown → set to `text`, set `first_attempt_logged_via` = `hubspot_sms`

3. **Save** — keep DISABLED.

---

### WORKFLOW 3: WF-03 · SBG Speed-to-Lead Escalation (ID: 45065797)

This has enrollment criteria and basic delay + set property actions. Rebuild the actions:

**Delete existing actions** and rebuild:

1. **Delay 15 minutes**
   - Add action → "Delay for a set amount of time" → 15 minutes

2. **If/then branch: Check first attempt**
   - Condition: `first_attempt_at` is unknown
   - **YES (no attempt yet — MISSED):**
     - Set property: `speed_to_lead_missed` = `true`
     - Send Slack notification to Contact owner AND Daniel Garnier:
     ```
     ⚠️ 15 min, no attempt — {{firstname}} {{lastname}} ({{phone}}) assigned to {{hubspot_owner_id}} at {{lead_assigned_at}}. Call now. {{record_link}}
     ```
     - Continue to step 3
   - **NO (attempt was made):** End workflow

3. **Delay 15 more minutes**
   - Add action → "Delay for a set amount of time" → 15 minutes

4. **If/then branch: Check first attempt again**
   - Condition: `first_attempt_at` is unknown
   - **YES (still no attempt — REASSIGN):**
     - Set property: `speed_to_lead_reassigned` = `true`
     - **Sub-branch:** Check `lead_routing_reason` = `budget_50k`
       - **YES ($50K lead — don't reassign Daniel):**
         - Just send another Slack to Daniel:
         ```
         ⚠️⚠️ 30 min, STILL no attempt — {{firstname}} {{lastname}} ({{phone}}). This is your $50K+ lead. {{record_link}}
         ```
       - **NO (rotation lead — reassign):**
         - Add action → "Rotate record to owner" → select the other 2 reps (exclude original)
         - Set property: `lead_routing_reason` = `reassigned_miss`
         - DO NOT change `lead_assigned_at` — leave it as the original timestamp
         - Create task: `FIRST TOUCH — call within 15 min — {{firstname}} {{lastname}}`, Call type, High priority, due +15 min, assigned to new owner
         - Send Slack to new owner + Daniel:
         ```
         🔁 Reassigned → {{hubspot_owner_id}}: {{firstname}} {{lastname}} ({{phone}}). 30 min unattempted. Original owner: {{original_owner_id}}. {{record_link}}
         ```
   - **NO (attempt was made):** End workflow

5. **Set goal criteria:**
   - Click "Goal criteria" (or "Unenrollment criteria") at the top of the workflow
   - Set: `first_attempt_at` is known
   - This ensures the contact exits the workflow immediately when an attempt is logged

6. **Save** — keep DISABLED.

---

### WORKFLOW 3b: WF-03b · After Hours (ID: 45065798)

Identical to WF-03 except:
- Enrollment: `business_hours_lead` = `false` (already set)
- Step 1: Instead of "Delay 15 minutes", use **"Delay until a day or time"** → Next business day, 8:15 AM, America/Chicago
- Step 3: Delay 15 more minutes (so it checks at 8:30 AM)
- Everything else is the same as WF-03

---

### AFTER ALL WORKFLOWS ARE BUILT

1. **Check Facebook Lead Ads default owner:**
   - Go to Settings → Integrations → Facebook Lead Ads
   - If the default owner is Arif Rahman, change it to one of the active reps or remove it
   - This prevents new leads from being assigned to Arif

2. **Do NOT enable any workflow yet.** We test on Friday Sep 11.

3. **Tell me when all 4 workflows are built** so I can review them before testing.

---

## Test Plan (Friday Sep 11)

Once all workflows are confirmed built and reviewed:

1. **Test 1 — Normal rotation lead:** Submit the live Meta form with a rep's phone → verify owner assigned, task created, Slack received, all properties populated
2. **Test 2 — Missed lead:** Submit and don't call for 15 min → verify miss flag, Slack warning, then at 30 min verify reassignment
3. **Test 3 — $50K lead:** Submit with budget "$50k+" → verify goes to Daniel
4. **Test 4 — After hours:** Submit at 7 PM → verify after-hours message sent, task due 8:15 AM next day
5. Enable all workflows for all three reps Monday Sep 14
