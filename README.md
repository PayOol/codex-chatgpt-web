# Codex Web GPT + OpenCodex — PayOol

Windows distribution of [Codex Web GPT Enhanced](https://github.com/Evanlau1798/codex-chatgpt-web) with the [OpenCodex](https://github.com/lidge-jun/opencodex) integration included.

Codex connects to Codex Web GPT. ChatGPT Web models keep their existing model, effort and native-tool behavior. The same launcher also contains the OpenCodex dashboard, providers, accounts, models and managed updates.

## Installer / Installation

**Windows 11 x64 — preview `6.1.5-Enhanced.2-PayOol.1`.**

- [Download the Windows installer](https://github.com/PayOol/codex-chatgpt-web/releases/download/v6.1.5-Enhanced.2-PayOol.1/codex-web-gpt-6.1.5-Enhanced.2-PayOol.1-win-x64.exe)
- [Release notes, checksums and validation limits](https://github.com/PayOol/codex-chatgpt-web/releases/tag/v6.1.5-Enhanced.2-PayOol.1)
- [Guide français](docs/INSTALL.fr.md)

1. Run the installer and open **Codex Web GPT PayOol** from the Start menu.
2. Follow the normal ChatGPT sign-in and Codex installation steps. Configure the Native2 connector if you use native tools through ChatGPT Web.
3. Open **OpenCodex**, below **Configuration**, and connect your own providers/accounts. Their models are included in the catalog served to Codex. Fully restart Codex after its initial model setup.

The installer includes the official OpenCodex package, Bun, and a private Node/npm runtime. First launch provisions the integration without Git, Python, system Node/npm, source builds or manual file editing. No account, cookie, key or configuration from the developer's machine is included. Available models and reasoning levels depend on each user's own accounts.

The launcher must remain running to serve Codex. Keep-running-on-close can hide its window while retaining the service; fully quitting it stops the connection. OpenCodex updates wait for active tasks, then restart only the internal OpenCodex process. See [update behavior](integrations/opencodex/README.md#update-behavior).

This preview packages Windows x64 only. Existing macOS/Linux documentation describes the upstream project; this fork does not publish integrated installers for those platforms yet. See the release notes for exactly which account-bound checks were completed.

## Build and verify

Source development requires Bun 1.4.0+34cbb9a40. Build on Windows x64 with Node available:

```powershell
git clone https://github.com/PayOol/codex-chatgpt-web.git
cd codex-chatgpt-web
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd launcher
bun run verify
$env:CODEX_CHATGPT_WEB_BUN = (Get-Command bun).Source
node integrations/opencodex/build-distribution.cjs
```

The installer is written under `dist/payool/artifacts/`. The build uses the checked-in integration sources, pinned public Node/OpenCodex packages and the official launcher source; it never copies a developer profile. A checksummed manifest verifies the bundled payload before first-run provisioning. OpenCodex's upstream source is not patched.

Before publishing a release, run the focused integration tests, `bun run verify:release`, and the clean-profile distribution smoke. The live gate uses the signed-in launcher and must not be retried after a quota or verification limit. See [distribution maintenance](docs/PAYOOL-DISTRIBUTION.md).

## Updating and existing installations

This fork's launcher update checks use **PayOol/codex-chatgpt-web**. They do not silently replace it with an upstream installer. Public previews are installed explicitly; GitHub's latest-release updater offers stable releases only.

OpenCodex updates still come from the official npm package and are managed independently. Providers and credentials live outside versioned program files. A launcher upgrade preserves an independently updated OpenCodex version and existing settings. Close the previous launcher normally, after tasks finish, before switching installations; two launchers must not own the same profile simultaneously.

## Credits and license

Codex Web GPT was created and is primarily developed by [miuuyy](https://github.com/miuuyy). This distribution builds on [Evanlau1798's Enhanced fork](https://github.com/Evanlau1798/codex-chatgpt-web) and uses [lidge-jun's official OpenCodex package](https://github.com/lidge-jun/opencodex). PayOol maintains the optional integration and this distribution. It is not an official OpenAI product.

The [MIT license](LICENSE), bundled dependency licenses and upstream attributions are retained. [Original Enhanced documentation](docs/UPSTREAM-README.md) remains available as reference documentation, not as installation instructions for this distribution.
