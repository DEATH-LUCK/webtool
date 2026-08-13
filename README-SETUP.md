# Setup & Deploy — what was fixed + how to go live

## What was broken/incomplete (fixed in this pass)

1. **Missing `firestore.rules`** — the biggest gap. There was no security-rules
   file in the repo at all, so the database was either wide open or fully
   locked depending on how the Firebase project was initialized. Added a
   `firestore.rules` that matches the app's actual role logic
   (`user` / `admin` / `superadmin`, `pending` / `approved` / `banned`).
   Wired it into `firebase.json` under a `"firestore"` key.
2. **Dead "admin magic-link" login** — `sendAdminMagicLink()` in `auth.js`
   read from an input (`#adminEmail`) that didn't exist anywhere in
   `index.html`, and no button ever called the function. It's now wired to
   the existing "Email" field on the Sign In tab, with an **"Email link
   (admin)"** link next to "Forgot Password?".

Everything else (upload, reader, admin panel, bulk actions, the separate
📚 Library + secure proxy) was already wired correctly — I cross-checked
every `onclick`/`getElementById` in the JS against `index.html` and
syntax-checked all files with Node; no other broken references found.

## Deploy steps

```bash
npm install -g firebase-tools
firebase login
firebase use webtool-76d54          # your existing project
firebase deploy --only firestore:rules,functions,hosting
```

(`functions` needs `cd functions && npm install` once before the first deploy.)

## Creating your first admin (do this once)

The rules block anyone from self-promoting to `admin`/`superadmin` — that's
intentional. To create the first superadmin:

1. Sign up normally in the app (creates a `pending` user doc).
2. Firebase Console → Firestore → `users/<your-uid>` → edit the document →
   set `role: "admin"`, `superadmin: true`, `status: "approved"`.
3. Reload the app — you now see the Admin Panel.

## Things you'll still need to supply yourself

- **Google Drive OAuth consent screen**: `GDRIVE_CLIENT_ID` in `js/gdrive.js`
  is already set to your existing OAuth client — if uploads fail with an
  "access blocked" popup, add your Google account as a test user (or publish
  the app) in Google Cloud Console → APIs & Services → OAuth consent screen.
- **Firebase Auth providers**: make sure Email/Password sign-in is enabled
  in Firebase Console → Authentication → Sign-in method (and Email Link, if
  you want the admin magic-link button to work).
