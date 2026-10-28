# The Forge — Athlete Development Portal (live version)

A real, multi-user version of the portal demo: families, coaches and admins sign in
with their email and a password, coaches write monthly assessments, and every report is kept.
Accounts are created by a Forge administrator (no self sign-up), so only people the club
adds can get in.

It is a standalone site for now. Later, the RWC website can simply link to it
(e.g. a "Athlete Portal" button pointing at `athletes.rochellewrestlingclub.com`).

## What's in this folder

| Path | What it is |
|---|---|
| `public/` | The website itself (upload this folder to Vercel). |
| `public/config.js` | The only file you edit: your Supabase address and public key. |
| `supabase/schema.sql` | Creates the database and the rules for who can see what. |
| `supabase/coach-requests.sql` | Adds coach profiles and family coach requests (run after `schema.sql`). |
| `supabase/functions/manage-login/index.ts` | Lets an admin create sign-ins and reset passwords from the portal. |
| `supabase/functions/send-notifications/index.ts` | Sends "new report / request / meeting" emails. |

## How privacy is enforced

The rules live in the database, not the web page, so they hold even if someone
tinkers with the site:

- Families see only athletes linked to their email, and only **published** reports.
- Coach observation notes are stored separately and are never sent to families.
- Coaches see only athletes assigned to them. Admins see everything.
- A published report is locked. Only goal progress and "read" marks can change.
- Meeting times close as soon as one family requests them.
- Nobody can create their own account. An admin adds each person and gives them a
  temporary password, which they must change at first sign-in.

---

## Setup (about 45 minutes, one time)

You'll create three free accounts: **Supabase** (database + sign-in),
**Resend** (sends emails) and **Vercel** (hosts the site, which you already use).

### 1. Create the database (Supabase)

1. Go to **supabase.com** → sign up → **New project**.
   Name it `forge-portal`, pick a strong database password (save it), region **East US (Ohio)** or **Central US**.
2. When it finishes, open **SQL Editor** → **New query**.
3. Open `supabase/schema.sql`, copy everything, paste, click **Run**. You should see "Success."
4. New query again. Paste this line with **your** name and email, then **Run**:
   ```sql
   insert into public.people (email, full_name, role, is_coach)
   values ('your.email@example.com', 'Your Name', 'admin', true);
   ```
   (Use lowercase for the email.) This makes you the first administrator, and lets you coach too.

### 2. Lock down sign-up and create your own sign-in

1. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
   (Admins create everyone's sign-in from the portal instead.)
2. **Authentication → Users → Add user → Create new user**: your email and a password,
   with **Auto Confirm User** checked. This is the only account you create here; everyone
   else is added from the portal.
3. **Authentication → URL Configuration**: set **Site URL** to your Vercel address.

### 3. Send notification emails (Resend) — optional, can wait

Emails are **off** by default (`emailNotifications: false` in `public/config.js`); everything still
shows up in the portal. To turn them on, finish this step, then set it to `true`.

Sign-in doesn't need email. This step only turns on the "new report / request / meeting"
emails to families.

1. Sign up at **resend.com**. Free plan: 100 emails a day, 3,000 a month.
2. **Domains → Add domain** → `rochellewrestlingclub.com`. Resend shows a few DNS records;
   add them wherever the club's domain is managed (or ask whoever runs the website).
   Until the domain is verified, Resend only lets you send test emails to yourself.
3. **API Keys → Create** → copy the key (starts with `re_`).

### 4. Turn on family notification emails

1. In Supabase: **Edge Functions → Deploy a new function → Via editor**.
   Name it exactly `send-notifications`, paste the contents of
   `supabase/functions/send-notifications/index.ts`, click **Deploy**.
2. **Edge Functions → Secrets** (or Project Settings → Edge Functions), add three:
   - `RESEND_API_KEY` = your Resend key
   - `FROM_EMAIL` = `The Forge <portal@rochellewrestlingclub.com>`
   - `SITE_URL` = your Vercel address (step 5)

### 5. Put the site online (GitHub Desktop + Vercel)

1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
   Open `public/config.js` and paste them in. (Never use the `service_role` key here.)
2. Commit that change to this repo (GitHub Desktop: **Commit to main** → **Push origin**).
3. Vercel: **Add New → Project** → import `forgedevelopment` → **Deploy**.
   (`vercel.json` already tells Vercel to serve the `public` folder; no other settings needed.)
   From then on, every push to `main` redeploys the site automatically.
4. Copy the address Vercel gives you (like `forgedevelopment.vercel.app`) into
   Supabase **Site URL** (step 2.3) and the `SITE_URL` secret (step 4.2).

### 6. First sign-in

Open your Vercel address and sign in with the email and password from step 2.
You'll land on **Administrator**. Then:

1. **People → Add person & create sign-in** for each coach and parent. The portal shows a
   temporary password once; share it privately. They choose their own at first sign-in.
   Forgotten password? **People → Set password** gives them a new temporary one.
2. **Athletes → Add an athlete**: pick the coach, link one or two guardians, set
   subscription to **Test activation** (or **Active** once they've paid on the RWC site).
3. Coaches sign in, add their meeting times, and start assessments.

---

## Showing it to the board

Use real sign-ins with made-up athletes:

- Add yourself as admin + coach (step 1.4 already did this).
- Add a "parent" using a second email of yours. Gmail tip: `you+parent@gmail.com`
  counts as a different email.
- Add a test athlete or two (status **Test activation**), write and publish an assessment,
  then sign in as the "parent" on your phone to show the report, the email it triggered,
  a reflection and a meeting request.
- Afterward, set test athletes to **Inactive** or delete them in Supabase (**Table Editor**).

## Costs and limits to know

- **Supabase free plan:** a free project pauses after about 7 days with little activity.
  You'll get a warning email, and your data is kept. Click **Resume project**
  in the dashboard. Once families rely on it, the paid plan avoids pausing.
- **Resend free plan:** 100 emails a day, 3,000 a month: plenty for a club this size.
- **Vercel:** deploy under your existing Vercel Pro account, which covers commercial use
  once the club charges the $39 subscription.

## Not built yet (on purpose)

- **Stripe:** subscriptions are marked by an admin for now. Hooking Stripe
  payments to "Active" automatically is the next phase.
- **Texts:** email only for now. Texting needs Twilio and carrier registration.
- **Corrections to published reports:** locked by design. An admin can edit in
  Supabase's Table Editor if something must change.
- **AI "Polish My Assessment":** not included.

## Before real families use it

Get the board's approval, and add a short privacy notice and consent to the RWC
registration (what's collected, who sees it, how long it's kept, how to request deletion).
The portal stores evaluations of minors, so treat it like any other youth record.
