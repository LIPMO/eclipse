# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

*Signature de code gratuite fournie par SignPath.io, certificat de la SignPath Foundation.*

## What is signed

Only the Windows files of the **ECLIPSE Launcher** published on the [GitHub Releases](https://github.com/LIPMO/eclipse/releases) page of this repository:

- `ECLIPSE-Launcher-Setup.exe` (installer)
- `ECLIPSE-Launcher-Portable.exe` (portable version)

These files are built exclusively by GitHub Actions ([`.github/workflows/launcher.yml`](.github/workflows/launcher.yml)) from the source code of this public repository. No file built on a personal computer is ever submitted for signing. Every build also receives a GitHub build provenance attestation and published SHA-256 checksums (`SHA256SUMS.txt`).

## Team roles

| Role | Members |
|---|---|
| Committers and reviewers | [LIPMO](https://github.com/LIPMO) |
| Approvers (signing requests) | [LIPMO](https://github.com/LIPMO) |

All team members use multi-factor authentication on GitHub and SignPath. Every signing request is approved manually by an approver.

## Privacy policy

The ECLIPSE Launcher only connects to:

- the ECLIPSE game server chosen in its settings (by default `https://eclipseee.online`), to show the server status, the daily shop and the release notes, and to open the game;
- `https://github.com/LIPMO/eclipse/releases` to check for and download launcher updates (can be turned off in the settings).

It does not collect, store or transfer any other information. Data handled by the game itself (account, statistics) is described in the game's privacy policy: <https://eclipseee.online/confidentialite.html>.

## License

ECLIPSE is free software released under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). The ECLIPSE name and logo are not covered by the license.
