# Chunk 1 — Message Templates

Create these in HubSpot: Settings → Tools → Templates (or Conversations → Templates).
Use the exact internal names so workflows can reference them.

---

## SBG-01-AH-email-v1 — After-Hours Acknowledgement (Email)

**Template name:** `SBG-01-AH-email-v1`
**Subject:** Thanks for reaching out to Signs By G!
**From:** Company default (or sales@signsbyghouston.com)

**Body:**

```
Hi {{firstname}},

Thanks for reaching out to Signs By G! We received your inquiry and wanted to let you know we're on it.

Our team is currently offline, but a dedicated sign consultant will call you first thing tomorrow morning at 8:00 AM CST.

Here's what happens next:
• A team member will call you within minutes of our office opening
• They'll discuss your project and answer any questions
• If it's a fit, we'll schedule a free site survey at your location

If this is urgent or you'd like to get a head start, you can reply to this email with:
📍 Your business address
📸 Photos of your current signage or building
💭 Any design ideas or inspiration

We look forward to speaking with you!

— The Signs By G Team
📞 (832) 402-7446
🌐 signsbyghouston.com
```

---

## SBG-01-AH-text-v1 — After-Hours Acknowledgement (SMS)

**Template name:** `SBG-01-AH-text-v1`

**Body:**

```
Hi {{firstname}}, this is Signs By G! 👋 We got your sign inquiry and wanted you to know a team member will call you first thing tomorrow at 8 AM. If you'd like to get a head start, reply with your business address and any photos of your current signage. Talk soon!
```

---

## SBG-01-T1-text-v1 — First Touch Follow-Up (Text)

**Template name:** `SBG-01-T1-text-v1`

Used by reps when the first call doesn't connect (sent immediately after call attempt).

**Body:**

```
Hi {{firstname}}, this is {{owner.firstname}} from Signs By G. I just tried calling about your sign project. I'd love to learn more about what you're looking for! When's a good time to connect? You can also check out our work and get started here: [Site Packet Link]
```

> Replace [Site Packet Link] with your actual site packet URL.

---

## SBG-01-T1-email-v1 — First Touch Follow-Up (Email)

**Template name:** `SBG-01-T1-email-v1`

Used by reps when the first call doesn't connect (sent immediately after call + text).

**Subject:** About your sign project — {{company}}
**From:** Contact owner

**Body:**

```
Hi {{firstname}},

This is {{owner.firstname}} from Signs By G — I just tried giving you a call about your sign project.

I saw you're looking at a {{what_is_your_estimated_budget_for_this_project}} project. We'd love to help bring your vision to life.

Here's what I can help with:
• Custom channel letter signs
• Monument signs & pylons
• LED displays & digital signage
• Interior signage & wayfinding
• Vehicle wraps & fleet graphics

I've attached our Site Packet so you can see some of our recent work and learn about our process.

📎 [Site Packet Link]

What's the best time to connect this week? I'm available:
• Today until 6 PM CST
• Tomorrow anytime 8 AM – 6 PM CST

Or just reply to this email and I'll get right back to you.

Looking forward to it!

{{owner.firstname}} {{owner.lastname}}
Signs By G
📞 {{owner.phone}}
```

> Replace [Site Packet Link] with your actual site packet URL.

---

## How to create templates in HubSpot

### For Email Templates:
1. Go to **Conversations → Templates**
2. Click **New template** → **From scratch**
3. Name it exactly as shown above (e.g., `SBG-01-AH-email-v1`)
4. Paste the subject and body
5. Replace personalization tokens with HubSpot tokens:
   - `{{firstname}}` → click "Personalize" → Contact → First name
   - `{{owner.firstname}}` → click "Personalize" → Contact owner → First name
   - `{{company}}` → click "Personalize" → Contact → Company
   - etc.
6. Save

### For SMS Templates (if HubSpot SMS is enabled):
1. Go to **Conversations → Templates**
2. Click **New template** → choose SMS
3. Name it exactly as shown
4. Paste the body with personalization tokens
5. Save

### If SMS is NOT enabled:
- Use the email template `SBG-01-AH-email-v1` in the workflow instead
- The first-touch text `SBG-01-T1-text-v1` becomes a manual action for reps (they copy-paste from a shared doc or use the HubSpot mobile app's template feature)

---

## Template Reference Table

| Internal Name | Type | Used By | When |
|---|---|---|---|
| `SBG-01-AH-email-v1` | Email | WF-01 (auto) | After-hours lead arrives |
| `SBG-01-AH-text-v1` | SMS | WF-01 (auto) | After-hours lead arrives (if SMS enabled) |
| `SBG-01-T1-text-v1` | SMS/Text | Rep (manual) | First call doesn't connect |
| `SBG-01-T1-email-v1` | Email | Rep (manual) | First call + text don't connect |
