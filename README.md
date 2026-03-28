# LedgerFlow Voice

A browser-based personal accounting app focused on voice dictation for capturing expenses, income, and transfers.

## Open

Open [index.html](C:\Users\Ali Reza\Documents\New project\index.html) in a modern browser.

## Included

- Voice-first transaction capture with Web Speech API support
- Manual add and edit flows for transactions, accounts, and categories
- Income, expense, and transfer tracking across editable accounts
- Categories with icons, subcategories, and weekly or monthly budget limits
- Extended transaction search with filters
- Reports for cashflow, categories, accounts, budgets, projects, and tags
- CSV export and CSV import for transactions, accounts, and categories
- Optional Supabase auth and cloud sync

## Notes

- Data is cached locally in the browser with `localStorage`.
- Voice dictation depends on browser speech recognition support and microphone permission.
- To enable Supabase:
  1. Run [schema.sql](C:\Users\Ali Reza\Documents\New project\supabase\schema.sql) in your Supabase SQL editor.
  2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in [app.js](C:\Users\Ali Reza\Documents\New project\app.js).
  3. In Supabase Dashboard -> Authentication -> URL Configuration:
     - set `Site URL` to your GitHub Pages app URL
     - add the same GitHub Pages app URL to `Redirect URLs`
  4. In Supabase Dashboard -> Authentication -> Providers -> Email:
     - enable Email provider
     - keep email/password sign-in enabled
  5. Reload the app and sign in or sign up from the lock screen.
- When Supabase is configured, the app uses email/password auth and stores `accounts`, `categories`, and `transactions` in normalized Supabase tables.
- `ledger_state` is kept only as a legacy migration source for older installs that already synced to the snapshot model.
- The app automatically uses the current page URL as the email confirmation redirect, which works well for GitHub Pages as long as that deployed URL is added to Supabase redirect settings.
