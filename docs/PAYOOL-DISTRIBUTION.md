# Maintaining the integrated Codex Web GPT distribution

`integrations/opencodex/build-distribution.cjs` builds a Windows x64 NSIS installer in an isolated staging directory. It reuses the anchor-checked renderer/native-view patch, adds profile-relative provisioning and runtime hooks, and includes a public official OpenCodex package plus a checksummed private Node/npm runtime. No absolute builder paths or personal state belong in its payload.

The source version uses `<upstream>-Enhanced.<revision>-Integrated.<revision>`. Keep root and launcher package versions synchronized. The normal upstream release workflow excludes Integrated tags and legacy PayOol tags; use the dedicated distribution workflow or the local build command instead. Do not upload an unintegrated upstream package under an Integrated tag.

Before publishing:

1. Install frozen dependencies in the root and launcher.
2. Run `node --test integrations/opencodex/*.test.cjs`, the integration Bun suites and TypeScript check.
3. Run `bun run verify:release` with the signed-in launcher still open. Preserve any failure. Never force-stop the current bridge or retry an account limit.
4. Run `node integrations/opencodex/build-distribution.cjs` with `CODEX_CHATGPT_WEB_BUN` set to the pinned Bun executable.
5. Run the clean-profile smoke against the generated unpacked application and package. Use isolated `CODEX_CHATGPT_WEB_HOME`, `CODEX_HOME` and launcher-data paths; never run the upstream Windows package-smoke installer over an active user installation.
6. Verify absence of credentials/profile state, record the fresh install and upgrade results, generate SHA-256 checksums, then upload the exact verified artifacts to a draft release.
7. Publish a preview if the full interactive acceptance checklist remains incomplete. List those limits in release notes. A preview must not be advertised as a completed cross-platform or account-level certification.

The bundled payload is copied into immutable distribution directories outside the installed executable. Provisioning keeps providers, gateway keys, settings and independently upgraded OpenCodex versions. Source changes can be included in a later fork build without modifying OpenCodex itself. Official upstream launcher updates must be merged and rebuilt here; the fork's updater points only to PayOol releases.

The product, executable and shortcuts are named **Codex Web GPT**. The internal application ID, installer GUID and provisioning marker remain compatible with earlier installations. GitHub ownership and update URLs still refer to the actual fork repository.
