# VizCode Project Plan

VizCode is an independently installable Moodle question type, `qtype_vizcode`.
It owns its question data, authoring, live editor, renderer, and direct Jobe grading.
CodeRunner is not a dependency. Unused CodeRunner and OPT_Mentor checkouts and
legacy application tooling have been removed; vendored OPT code and notices remain.

## Implemented

- Python program and function questions, with private server-side tests on Jobe.
- Automatic tracing after a 500 ms edit pause; no first-open execution or Run/Stop controls.
- Compact source, stack/heap, step navigation and stdout; collapsed local scratch/Input.
- Isolated module-worker execution with one executing worker and one clean spare.
- Exact answer submission, tab-local auxiliary persistence and immutable review.
- Native question XML and backup/restore, configurable grading, and installer ZIP.
- VizCode naming across source, plugin metadata, build scripts and active fixtures.
- Existing questions/settings migrated with attempts, submitted answers and marks unchanged.

## Preservation

The workspace root remains CoodleViz by user request. Runtime versions, test
behavior, localhost ports and credentials are unchanged. Existing Docker volumes
retain their original opaque IDs through the ignored fixture `.env` mapping.
Database/configuration, old plugin and legacy source backups are outside the
project at `~/.cache/vizcode-preservation`; no data volume was deleted.
Explicit legacy identifiers remain only where needed for migration, XML conversion
and local storage compatibility. Source copyright and provenance notices are retained.

## Verification

Build `dist/vizcode.zip` with `node harness/scripts/build-vizcode.mjs --zip`.
Run the live/security and independent student tests in Chromium, Firefox and WebKit.
Check native question XML/backup round-trips and old-component migration safety.
The local student quiz is http://localhost:4112/mod/quiz/view.php?id=1.
See [docs/INSTALL.md](docs/INSTALL.md) for commands and deployment requirements.

## Remaining Release Gates

Historical third-party license audit; production hostname/cookie/CSP verification;
actual Safari real-Moodle grading; full privacy/uninstall review; optional Safe Exam
Browser and additional Moodle/PHP runtime testing. The current package remains alpha.