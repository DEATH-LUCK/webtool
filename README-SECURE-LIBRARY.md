# Separate Library — secure Google Drive serving

The separate **📚 Library** uses Google Drive as storage, but the browser uses the same-origin `/api/library-file?item=<book-document-id>` endpoint for preview/download/media playback after deployment.

## Deploy

From this folder:

```bash
npm install -g firebase-tools
firebase login
firebase use <YOUR_FIREBASE_PROJECT_ID>
cd functions
npm install
cd ..
firebase deploy --only functions:libraryFile,hosting
```

The included function looks up the Library book document in Firestore, verifies `libraryScope == "library"`, reads its Drive file ID server-side, and streams the file. This keeps the Google Drive URL out of the Library page's HTML and UI.

**Important:** the existing Google Drive files are currently made public by the browser upload flow. The proxy hides the Drive URL from normal users, but public Drive permissions should still be reviewed if you need the files to be inaccessible outside the website. For true private storage, move Drive authorization to a trusted server/service account and stop making uploaded files public.
