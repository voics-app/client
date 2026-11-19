# Desktop renderer performance

The renderer loads settings (including server administration), the emoji picker and slash-command panel on demand. A failed import is retried after 250, 500 and 1000 ms. The error offers another attempt, close, and an explicit app reload; reload can discard unsaved work. A browser may cache a failed module fetch for the life of a document, so a reload can be necessary even after connectivity returns.

Build with `pnpm --filter @discordy/desktop exec electron-vite build`, then run `node apps/desktop/scripts/check-renderer-budget.mjs`. The Vite manifest defines the entry and its transitive static imports; CI prints each JavaScript asset and fails if their combined uncompressed size exceeds 3,000,000 bytes. Dynamic chunks, CSS, workers and compressed size are excluded. Keep the threshold under review when dependencies or the app's initial feature set change; do not increase it without recording a new baseline and reason.

For cold-start acceptance, use a fresh isolated user-data directory on the agreed reference VM, with the same build type, hardware load, network and account state for both versions. Measure process launch to a visible signed-out auth screen repeatedly, record each sample and the median, and distinguish this from a warm start or synthetic backend test. Never use a production account for the isolated test.
