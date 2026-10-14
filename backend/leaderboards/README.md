# Northbound arcade leaderboards

The studio remains a static site on GitHub Pages. A separate Supabase project provides a database and the `leaderboards` Edge Function. No server credential belongs in the website repository.

Production uses **Northbound Games Website** in the **Northbound** organization, project `nkikexfddryoudommtjx`. The function is `https://nkikexfddryoudommtjx.supabase.co/functions/v1/leaderboards`.

## Deployment

1. Create a dedicated Northbound project in the owner's selected organization after confirming its cost.
2. Apply `schema.sql` as the `northbound_arcade_leaderboards` migration. Every table has RLS enabled; browser roles have no direct table or function access.
3. Deploy `index.ts` and `handler.mjs` as the `leaderboards` Edge Function. Set `verify_jwt = false`: the handler validates the modern publishable key in the `apikey` header, and secret guest tokens own the run tickets. The public key is not proof of a human player.
4. Set `assets/js/leaderboard-config.js` to the function URL and the project's public publishable key. Never use a secret or service-role key in that file.
5. Verify cross-origin reads, a real run submission, duplicate rejection, best-score retention, and denied direct table access before publishing the static files.

Run unit tests with `node --test backend/leaderboards/handler.test.mjs` from the studio folder. Edge Functions provide `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` at runtime. No additional secret file is required.

## Behavior and limits

Players opt in to publishing a completed run with a 3–18 character nickname. A random 256-bit guest token stays in the browser; only its hash is stored in the database. Clearing browser storage creates a new player identity. Duplicate nicknames are possible. Existing local scores cannot be uploaded retroactively.

Each board shows the top 25 all-time bests, one entry per guest player per game. Higher scores win; ties are ordered by the earlier achievement and a stable internal identity. Local trophies and scores continue working if the backend is unavailable.

Run tickets expire after 24 hours and can be used only once. The database enforces ownership, game matching, wall-clock bounds, atomic best-score updates, and hourly start limits. The handler checks score types, nickname characters, and generous per-game score-rate envelopes. Active game time excludes pauses. Network hashes supplement per-player limits but are not trusted authentication.

These checks catch basic abuse. Browser games can still be modified or scripted; this is a casual board, not a verified prize competition. Competitive prizes would require deterministic replay validation or an authoritative game server.

## Moderation

The owner can hide an entry through Supabase's table editor by setting `nb_lb_scores.hidden` to `true`. An improvement preserves that flag. Public readers never receive player hashes or network hashes. Contact details stay in the studio's existing Help page.

Only best scores are retained. Old run tickets and rate buckets are removed when new runs start. Periodically export the scores table for an owner-managed backup. The Free plan may pause on inactivity; choose a paid plan if uninterrupted availability becomes necessary.
