# VizCode Moodle Plugin

VizCode is an independently installable Moodle question type, `qtype_vizcode`.
It is not a Moodle-hosting platform. The vendored OPT code and its notices remain.

## Try the Development Build

- Student quiz: http://localhost:4112/mod/quiz/view.php?id=1
- Student: `student`, password `LocalStudentOnly1!`
- Administrator: `admin`, password `LocalFixtureOnly1!`
- Standalone live harness: http://localhost:4100/live.html

These credentials are for the localhost-only development fixture. Never use them
on a public deployment. Use a private browser window if logged into the older test
site at port 4102; the two development sites share the localhost cookie hostname.

Open or resume the quiz. Change Python source, then pause typing for 500 ms to
generate a trace. There is no execution on initial opening, and no Run or Stop
button. Use the arrow controls or slider to inspect steps, variables, objects,
and stdout. Open Scratch and Input for local function calls or stdin. Check/Submit
grades only the current answer source on Jobe; scratch, Input and traces remain
local. After finishing the quiz, review is immutable and starts no workers.

## Build and Install

The plugin source is in `plugin/vizcode`. Development requires Node.js 22, npm,
and Git; the Moodle/Jobe fixture additionally requires Docker and Docker Compose.

```sh
node harness/scripts/bootstrap.mjs
npm ci --prefix plugin/vizcode/frontend
npm ci --prefix harness
node harness/scripts/build-vizcode.mjs --zip
```

Bootstrap preserves existing checkouts and fetches only the pinned development
Moodle source only. No upstream checkout is required to build the VizCode widget: its
reused source snapshot and frontend lockfile are owned by the plugin package.

The generated installer is `dist/vizcode.zip`. Install it through Moodle's plugin
installer, or extract `vizcode/` into `question/type/` and run Moodle's normal
upgrade process. Tested development target: Moodle 4.5 and PHP 8.3. Purge Moodle
caches after deploying changed AMD/widget assets. Never deploy frontend node_modules
or fixture configuration; the ZIP excludes those dependencies.

Configure VizCode under Site administration, Plugins, Question types:

1. Jobe REST API base URL, for example `https://jobe.school.example/jobe/index.php/restapi`.
2. Optional Jobe API key, stored only in Moodle server configuration.
3. An HTTPS isolated browser-execution broker URL, for example
   `https://python.example.net/broker.html`.

Deploy the generated `execution-assets/` contents on that separate static host.
The main widget stays directly mounted in Moodle. The execution host must receive
no Moodle authentication cookies, including cookies scoped to a parent domain.
A different port/path alone is not isolation. The widget rejects same-hostname
execution, and permits HTTP only for loopback development hosts.

Restrict Moodle's server HTTP allowlist to the institution-configured Jobe endpoint;
do not copy the fixture's unrestricted private-HTTP setting into production. Jobe
must be configured as an untrusted-code sandbox and must not expose its API key to
the browser. Student output never assigns marks.

## Execution Host Headers

Separate origin alone does not block authenticated network requests. Apply the
following response policies, substituting your exact deployment origins:

```text
broker.html:
Content-Security-Policy: default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; frame-ancestors https://moodle.school.example; base-uri 'none'; form-action 'none'

worker.mjs and runtime modules:
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src https://python.example.net/pyodide/

all execution responses:
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
```

WebKit applies worker-src to runtime module imports, hence the explicit Pyodide
directory. Do not widen this to arbitrary scripts, blob:, data:, or Moodle's host.
Serve `.mjs` as JavaScript and `.wasm` as application/wasm. Permit the execution
frame and widget assets in Moodle's own CSP. Never fall back to authenticated-origin
execution. For a versioned asset deployment keep the broker and all its runtime
files together; stable filenames must not be served with immutable caching.

## Authoring and Grading

Select VizCode in Moodle's Add a question dialog. Choose Complete program or
Function definitions. Define 1 to 20 server-side tests as a JSON array:

```json
[
  {"stdin":"5\n", "expected":"120\n", "hidden":false},
  {"stdin":"0\n", "expected":"1\n", "hidden":true}
]
```

For function answers add `code`, such as `print(factorial(5))`. That code is
appended to the submitted answer only on Jobe, never sent to the live debugger.
`hidden` defaults to true. Public examples are displayed; hidden code/input/output
is absent from student rendering, external question definitions and feedback.
Feedback gives a pass count only. Native Moodle question XML and backup/restore
preserve all teacher-defined tests.

All tests must pass for full marks. Comparison normalizes CRLF/CR and ignores
trailing newlines, but not other whitespace. Jobe compile/runtime/time/memory/output
errors are failures; transport errors, malformed responses and internal/overload
outcomes are unavailable grading, not zero marks. Check preflights authorized
grading server-side and retains editing on an outage. Without JavaScript, Moodle
still submits/grads the textarea, but an outage may show Moodle's error page rather
than the inline retry notice. Successful server results are cached for five minutes
by exact source, tests, settings and plugin version; rendering review never reruns
student code merely to show feedback. Native Moodle attempt state remains authoritative.

## Live Runtime Limits

- Each question has at most two workers: one executing and one clean warming/ready.
  Every worker executes student code once and is retired. Never reset and reuse a
  student-modified Python/JavaScript environment. Idle clean spares expire after a minute.
- Latest edits replace pending work and cancel obsolete runs. IME composition is
  not executed mid-input. Empty source and read-only review do not execute.
- Runtime loading is limited to 60 seconds; execution to 10 seconds. Trace cap:
  1000 steps / 2 MiB. Stdout cap: 64 KiB UTF-8. Source/stdin/scratch cap: 100,000
  characters per field. Editing and Check remain available throughout.
- Scratch/Input are tab-scoped sessionStorage keyed by user and question attempt
  field. Storage denial degrades to page-local state. They are never form fields.
- Pyodide 314.0.2 and required assets are self-hosted. No AI or public CDN runtime
  requests are required. Browser memory exhaustion is not a hard security guarantee.

## Development Tests

```sh
npx --prefix harness playwright install chromium firefox webkit
npm start --prefix harness
sh harness/moodle-fixture/install-vizcode.sh
VIZCODE_URL=http://localhost:4112 npm test --prefix harness -- live.spec.js vizcode.spec.js --project=chromium --project=webkit
```

The installer is for a fresh fixture. For an existing development database use
Moodle's `admin/cli/upgrade.php` and `/fixture/vizcode-setup.php` instead. The
independent fixture is `compose.independent.yaml`.
Its Jobe service is private to the container network.

```sh
docker-compose -f harness/moodle-fixture/compose.independent.yaml exec -T -e VIZCODE_BACKUP_TEST=1 --user www-data moodle php /fixture/vizcode-setup.php
docker-compose -f harness/moodle-fixture/compose.independent.yaml stop
```

Firefox on this Mac could not launch its sandboxed helper and is tested inside
`mcr.microsoft.com/playwright:v1.58.2-noble`. Protected Documents bind mounts are
avoided by staging only test artifacts under `~/.cache/vizcode-fixture`; Linux
Moodle tests use host networking to reach the VM's localhost:4112.

Actual Safari live smoke testing requires Safari's Allow remote automation:

```sh
safaridriver -p 4103
node harness/scripts/safari-live.mjs
```

## Release Status

Verified: independent fresh Moodle installation direct Jobe
program/function grading, student Check/Submit/review, plugin upgrade, exact-source
XML round-trips, native course backup/restore including private tests, and ungraded
backend outages. Live/worker-pool tests pass in Chromium, Firefox and WebKit.
Actual Safari passes automatic tracing and immediate exact local submission.

Still required before institutional release: production hostname/cookie/CSP audit,
third-party historical license verification, actual Safari real-Moodle grading,
Safe Exam Browser testing if required, Moodle versions beyond the tested target,
and complete plugin uninstall/privacy/lifecycle review. Source notices remain
preserved; consult the plugin's THIRD_PARTY_NOTICES.md. The current package is an
alpha development deliverable, not production security/licensing certification.

The x86-only fixture Jobe image uses emulation on Apple Silicon and previously
showed a transient native-module segmentation fault. Validate a native production
Jobe service rather than relying on that emulator for deployment certification.

## Existing CoodleViz Installations

The component rename is a data migration, not a normal plugin-version upgrade.
Back up Moodle's database, file data, config and old plugin first. Install VizCode
alongside the old component, enable maintenance mode, then run:

```sh
php question/type/vizcode/cli/migrate-legacy.php --run
```

The command copies private question options and settings, updates the question
type, and verifies that submitted answers, attempts and grades remain unchanged.
After validation, uninstall the old component using Moodle's plugin administration,
remove its old code directory, purge caches and disable maintenance mode. Do not
uninstall the old component before migration: Moodle may delete its questions.

Old standalone question XML can be converted without modifying source/tests:

```sh
php question/type/vizcode/cli/convert-legacy-xml.php --input=old.xml --output=new.xml
```

Old course backups are not automatically rewritten by this converter; retain the
old plugin package for restoring those archives until compatibility is verified.
The browser adapter reads old auxiliary-storage keys to retain local scratch/Input.

For this workspace, preservation files are outside Git under
`~/.cache/vizcode-preservation`. The current fixture's ignored `.env` maps existing
database/file volumes to their original opaque IDs; those names are intentionally
retained to preserve data. New containers use `vizcode-dev`. A separate config
volume now preserves the generated Moodle config across rebuilds. The root
workspace directory remains CoodleViz, as requested. No data volume was deleted.