# Release checklist — rc.2

Repository: skerryvibe/oktonik, main branch. This checklist documents the release
procedure; it is not a claim that every hardware combination has been tested.

## Hardware acceptance

- Back up projects; install both archives through Schwung and restart Move.
- Check names, IDs and author Skerry Vibe.
- Import an existing project in each profile; edit one and verify the other
  remains unchanged, including after restart. Original Chord Pilot must remain intact.
- Check a new project starts clean and switching projects releases notes.
- Public: five pages, Menu navigates, no IDEAS, inactive Record/Capture/steps.
- Test modifiers, Borrow lock, edits, Bass Gesture, strum and melody.
- Test HOLD/PEDAL, STOP and all routes with real receiving instruments.
- Lab: verify experimental functionality is retained.
- Review inherited license notices and name availability before distribution.

## GitHub handoff, after owner approval

1. Sign in as skerryvibe. Create `oktonik` without generated README/license files.
2. Initialize local Git, review staged files, commit and push main. Exclude
   dist/build, private project data and credentials. The assistant can help.
3. Create prerelease `v0.1.0-rc.2`, titled `OKTONIK 0.1.0-rc.2`.
4. Attach Public tar.gz and SHA256SUMS. Optionally attach Lab as experimental.
5. Use the release notes, updated with real hardware results; verify downloads.
6. Only then request Schwung catalog inclusion. catalog-entry.json is a draft,
   not proof of host-version compatibility or catalog acceptance.

Authenticate through GitHub's normal flow; never put access tokens in chat/files.
