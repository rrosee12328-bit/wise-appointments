## Change

In `src/lib/google-oauth.functions.ts` (line 9), change the scope from:

```
https://www.googleapis.com/auth/calendar
```

to:

```
https://www.googleapis.com/auth/calendar.readonly
```

This is the only place in the codebase that references the Google Calendar scope.

## Heads-up — write-back will break

`src/lib/google-writeback.server.ts` currently writes events back to Google Calendar (create/update/delete). The `.readonly` scope **does not allow writes** — any write-back attempt will fail with a 403 from Google after this change. The sync (reading events into JeyLink) will continue to work fine.

Options:

1. **Accept it** — JeyLink becomes read-only for Google (just pulls appointments in). Simplest, and matches what Google's verification reviewers expect for `.readonly`.
2. **Keep full `calendar` scope** and finish Google verification instead. Slower but preserves write-back.

## After deploying

Existing users who already connected with the old scope keep their old token (still full access). New connections will get the narrower scope. If you want everyone on `.readonly`, have existing users disconnect + reconnect.

Confirm you want option 1 (switch to `.readonly`, accept write-back loss) and I'll make the one-line change.
