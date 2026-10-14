# Northbound Games publication

Northbound is published independently from SQD using GitHub Pages.

- Public address: https://northboundgames.studio
- Source repository: https://github.com/sanchezvaldesellenberger-blip/northbound-games
- Publish source: the root of the repository's `main` branch
- `.nojekyll` disables Jekyll processing so the supplied static files are served directly.
- `CNAME` selects `northboundgames.studio` as the custom domain.

Keep the complete `deadzone/` offline build in the Northbound publishing repository. It is intentionally ignored in the parent SQD repository, so publishing SQD does not publish the game studio or its game assets.

To update the studio, clone the Northbound publishing repository into a separate checkout, copy the approved studio HTML and `assets/` files into its root, and replace `deadzone/` only when publishing an updated offline build. Check asset paths and JavaScript syntax, test the pages and all six arcade games, and check that Deadzone loads before committing and pushing to `main`. GitHub Pages publishes that branch automatically.

## Squarespace DNS

Keep the domain registered with Squarespace and preserve all email, verification, DNSSEC, and nameserver settings.

The intended web records are:

| Type  | Host | Value                                   |
| ----- | ---- | --------------------------------------- |
| A     | @    | 185.199.108.153                         |
| A     | @    | 185.199.109.153                         |
| A     | @    | 185.199.110.153                         |
| A     | @    | 185.199.111.153                         |
| CNAME | www  | sanchezvaldesellenberger-blip.github.io |

The original Squarespace Defaults preset had four A records (`198.185.159.144`, `198.185.159.145`, `198.49.23.144`, `198.49.23.145`), `www` pointing to `ext-sq.squarespace.com`, and an HTTPS record with those Squarespace IPv4 hints. Replacing that web preset must leave the separate Domain Connect and Email Security presets intact.

Enable GitHub Pages HTTPS enforcement once GitHub has issued the certificate for the custom domain. DNS and certificate issuance are separate from the successful Pages deployment.

## Online arcade leaderboards

The site's HTTPS certificate is active and HTTPS enforcement is enabled. The six arcade leaderboards use the separate **Northbound Games Website** Supabase project in the **Northbound** organization. See `backend/leaderboards/README.md` for schema, API deployment, moderation, and score-validation limits. The browser uses only a publishable API key; server credentials remain in Supabase's runtime environment.
