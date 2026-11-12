# App Review recording

A scripted, continuous screen recording of the iOS app in the iOS Simulator, for the App Store review reply: create an account, sign in, chat, join a voice channel, report a message, block a user, delete the account.

It never touches production. The app is an EAS build of the `simulator` profile (`apps/mobile/eas.json`): `ios.simulator` is true and `VOICS_TEST_BACKEND_URL` is the placeholder `https://review-backend.invalid`. `app.config.ts` only honours that variable when `EAS_BUILD_PROFILE` is `simulator`, so a store or preview build cannot be redirected. The `sim-recording` workflow swaps the placeholder in the unpacked `.app` for the address of a throwaway backend, so one build serves every run.

## Steps

1. Start the local stack (`gitops/local/dev.sh up`) and expose it for the run only: `cloudflared tunnel --url http://127.0.0.1:18000` (a quick tunnel, no account; stop it afterwards). Voice media (UDP) does not cross the tunnel, so the call screen opens and signals but shows the connection as not established.
2. Seed a demo server on that backend and generate the test account values: a host and a friend account, a server with `#general` (the friend has posted a message) and a voice channel, and an invite code. The reviewer account is *not* created: the flow creates it in the app.
3. Build the app once: `cd apps/mobile && eas build --platform ios --profile simulator`. Copy the archive URL of the finished build.
4. Run the workflow: `gh workflow run sim-recording.yml --ref <branch> -f app_url=... -f backend_url=... -f email=... -f username=... -f password=... -f invite=...`. Until the workflow file is on the default branch, `workflow_dispatch` is not available; push a branch named `sim-recording/<anything>` instead and set the same values as the repository variables `REVIEW_APP_URL`, `REVIEW_BACKEND_URL`, `REVIEW_EMAIL`, `REVIEW_USERNAME`, `REVIEW_INVITE` and `REVIEW_PASSWORD` (a throwaway test value for the test backend) (delete them after the run). The run boots the newest iOS Simulator on the runner, installs the app, records with `xcrun simctl io recordVideo`, drives `review-flow.yaml` with Maestro and uploads `review.mp4` as the artifact `voics-review-recording`.

The flow is `review-flow.yaml` (labels it taps are the accessibility labels of the app); `pause.yaml` is the pause between steps. GitHub-hosted macOS minutes cost 10x, so the workflow is `workflow_dispatch` only.
