# Khelo India Khelo Member Map

A global map of every Khelo India Khelo member. Members join from a link shared in the WhatsApp groups. A new member's pin goes live **only after they click the confirmation email**. Anyone can search the left panel by **area** (locality, city, state or country) and by **profession** (category → speciality).

## How it works

```
WhatsApp link ──► "Add me to the map" form
                    │ name · email · phone · WhatsApp · business
                    │ category + speciality (pick-list only)
                    │ location (pick from autocomplete, so it's stored the same way for everyone)
                    ▼
            Supabase sends a confirmation email
                    │  (nothing is public yet)
                    ▼ member clicks the link
      Database trigger copies the details into `members` ──► pin appears on the map
```

| Who | Sees |
|---|---|
| Anyone with the link | Name, business, category, area pin |
| Signed-in, confirmed members | Everything above, plus phone, WhatsApp (one-tap chat) and email |
| The member | Can edit or delete their own entry (DPDP right to erasure) |

The database enforces the categories: an entry whose category or speciality isn't on the list is rejected. Free-text categories can't get in.

## Files

```
index.html              the app (map + search panel + join / sign-in dialog)
css/styles.css          styling (automatic light / dark theme)
js/config.js            ← paste your Supabase URL + anon key here
js/categories.js        ← the business category list (the single place to edit it)
js/app.js               app logic
js/countries.js         phone country codes
js/demo-data.js         sample members, used only in demo mode
supabase/schema.sql     tables, confirmation trigger, privacy rules
supabase/categories_seed.sql   generated from categories.js
tools/gen_category_sql.py      regenerates the seed after you edit categories
```

## Try it now (demo mode)

With `js/config.js` blank, the app runs in demo mode: 26 sample members, and the email step is simulated.
Serve the folder and open it:

```bash
cd ~/Downloads/khelo-india-khelo-map && python3 -m http.server 8080
```

Then open http://localhost:8080.

## Go live (about 30 minutes, free tier)

1. **Create a Supabase project** at supabase.com (free). Pick the Mumbai (ap-south-1) region.
2. **SQL Editor** → paste and run `supabase/schema.sql`, then `supabase/categories_seed.sql`.
3. **Authentication → Sign In / Providers → Email**: enable it and keep "Confirm email" on.
4. **Authentication → URL Configuration**: set *Site URL* to your live address (e.g. `https://map.kheloindiakhelo.org`) and add it to *Redirect URLs*.
5. **Custom email sender (required).** Supabase's built-in mailer allows only a handful of emails an hour. Under **Authentication → Emails → SMTP Settings**, plug in a free Resend or Brevo account and a sender such as `map@kheloindiakhelo.org`.
6. **Email template.** Under **Authentication → Emails → Magic Link** (and **Confirm signup**), set:
   - Subject: `Confirm your place on the Khelo India Khelo map`
   - Body:
     ```html
     <h2>Welcome to Khelo India Khelo 🇮🇳</h2>
     <p>Click below to confirm your email and put your pin on the Khelo India Khelo global member map.</p>
     <p><a href="{{ .ConfirmationURL }}">Confirm and add me to the map</a></p>
     <p>If you didn't request this, ignore this email and nothing will be published.</p>
     ```
7. **Connect the app.** Copy *Project URL* and *anon public key* (Project Settings → API) into `js/config.js`.
8. **Deploy.** Drag the folder onto Netlify Drop (app.netlify.com/drop), or push it to GitHub and use Vercel or Cloudflare Pages. It's a static site, so there's no build step.
9. **Share the link** in every Khelo India Khelo WhatsApp group with one line: *"Add yourself to the Khelo India Khelo world map, takes 60 seconds 👉 <link>"*.

## Changing categories

Edit `js/categories.js`, run `python3 tools/gen_category_sql.py`, then run the new `supabase/categories_seed.sql` in Supabase and redeploy. Categories that members already use are never removed.

## Admin tasks (Supabase dashboard → Table Editor → `members`)

- Remove a spam entry: delete the row, and also delete the user under Authentication → Users.
- Export the full directory: Table Editor → `members` → Export CSV.

## Roadmap

| Phase | What | Why |
|---|---|---|
| **1. Launch** (this build) | Join form with email confirmation, global map, area and profession search, contacts visible to members only | Get the groups onto one map |
| **2. Trust** | Admin approval queue (a `status` column), "Edit my profile" screen, WhatsApp-group tag per member | Keep out non-members once the link spreads |
| **3. Engagement** | "Members near me" radius search, city chapters with a lead per city, new-member digest into WhatsApp | Turn the map into meetings and deals |
| **4. Business layer** | Asks & offers board ("looking for a CA in Dubai"), referral tracking, event check-ins by city | Show the value of membership |

## Credits

Map tiles © Esri, © OpenStreetMap contributors. Location search by Photon (komoot) on OpenStreetMap data. Built with Leaflet and Supabase.
