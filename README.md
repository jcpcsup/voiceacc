# LedgerFlow Voice

A browser-based personal accounting app focused on voice dictation for capturing expenses, income, and transfers.

## Included

- Voice-first transaction capture with Web Speech API support
- Manual add and edit flows for transactions, accounts, and categories
- Income, expense, and transfer tracking across editable accounts
- Categories with icons, subcategories, and weekly or monthly budget limits
- Extended transaction search with filters
- Reports for cashflow, categories, accounts, budgets, projects, and tags
- CSV export and CSV import for transactions, accounts, and categories

## Notes

- Data is stored locally in the browser with `localStorage`.
- Voice dictation depends on browser speech recognition support and microphone permission.

## Supabase Phase 1

Phase 1 adds:

- Supabase email/password auth
- cloud sync for `transactions`
- local fallback when Supabase is not configured

Setup:

1. Create a Supabase project.
2. Run [supabase/phase1.sql](/root/acc/voiceacc/supabase/phase1.sql) in the SQL editor.
3. Edit `config.js` using [config.example.js](/root/acc/voiceacc/config.example.js) as a reference, then add your project URL and anon key.
4. Open the app and sign in or create an account from the lock screen.

Scope:

- `accounts` and `categories` still remain local in Phase 1.
- transactions store account/category name snapshots so synced entries still render before Phase 2.
