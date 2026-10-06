# LedgerFlow Voice (Android & Local-First)

A private, offline-first personal accounting app with voice dictation for capturing expenses, income, and transfers.

## Features

- **Voice-first transaction capture**: Powered by native Android speech recognition and Web Speech API.
- **Local-First & Offline Architecture**: All data stored locally in **IndexedDB**; 100% private with zero cloud dependencies.
- **App Lock & Security**: Optional **4-Digit PIN (PBKDF2-HMAC-SHA256)** + **Biometric Unlock** (Fingerprint / Face ID) with auto-lock timeouts and brute-force lockout protection.
- **Lossless Full Backup & Restore**: One-click **ZIP export/restore** bundling transactions, accounts, categories, and all compressed receipt image attachments.
- **Transaction Receipt Slips**: Capture and attach receipts stored directly in local storage.
- **Reports & Visual Analytics**: Cashflow, categories, accounts, budgets, projects, and tag breakdowns.
- **CSV Data Tools**: Import and export transactions, accounts, and categories with reconciliation for duplicates.
- **Android Ready**: Packaged with Capacitor (`com.ledgerflow.voice`) with automated GitHub Actions CI/CD building downloadable APKs and Google Play-ready AABs.

## How to Run

### Web (Browser)
Open `index.html` in any modern web browser or serve via a local static server:
```bash
npx serve .
```

### Android Development
```bash
npm install
npx cap sync android
npx cap open android
```

## Automated Builds
Pushes to `master` automatically trigger GitHub Actions to compile downloadable `.apk` artifacts.
Tagging a release (e.g. `v1.0.0`) automatically publishes a GitHub Release with the APK and Google Play bundle attached.
