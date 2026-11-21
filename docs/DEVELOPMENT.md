# Development and local testing

For a guided group demo, start with [Group testing](TEAM-TESTING.md) and
`sh harness/demo.sh setup`. The commands below explain its individual stages.

Use macOS/Linux or Windows WSL2. Install Git, **Node.js 22/npm**, Python 3,
Docker Engine/Desktop and Compose. Start Docker and allow at least **6 GB RAM**
and approximately **15 GB free Docker storage**. No host Java installation is
required. Internet access is required for initial source/compiler/image downloads.

```sh
git clone --branch main https://github.com/charasleeping/vizcode.git
cd vizcode
npm ci --prefix plugin/vizcode/frontend
npm ci --prefix harness
node harness/scripts/bootstrap.mjs
node harness/scripts/build-vizcode.mjs
```

The first bootstrap verifies/downloads the pinned Moodle, CodeRunner and adaptive
behaviour checkouts. The build creates editor/runtime bundles; native debugger images are built by
the demo installer. Start the local Moodle
demo directly from source:

```sh
sh harness/coderunner-fixture/install.sh
```

No installer ZIP is needed for local testing. Creating a distributable ZIP remains
a separate maintainer operation.

The installation script builds isolated services, installs a **separate fresh
Moodle database**, creates demonstration questions/accounts and prints the quiz URL.
These stages are separate so ordinary editor changes do not reinstall Moodle or
redownload the compiler.

The CodeRunner fixture uses its own `vizcode-coderunner` volumes, Moodle on
[localhost:4115](http://localhost:4115) and execution on `127.0.0.1:4102`. It uses its own database. Random service secrets are
written to an ignored, owner-readable fixture `.env`.

| Role | Username | Local test password |
| --- | --- | --- |
| Administrator | `admin` | `LocalFixtureOnly1!` |
| Teacher | `teacher` | `LocalTeacherOnly1!` |
| Student | `student` | `LocalStudentOnly1!` |

These credentials are public development fixtures, never production credentials.
Choose a quiz from the course page, or use the printed URL. Quiz IDs vary.

To update the same fixture, rebuild the assets and rerun `install.sh`. It detects
an existing installation and runs Moodle's upgrade instead of reinstalling the
database. Stop it with the same Compose file and `stop`; do not delete volumes:

```sh
sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml stop
```

## Standalone editor and tests

The standalone page is only an editor test harness; it contains no grading engine.
Use port 4104 for its isolated execution host, separate from the Moodle execution service.

```sh
VIZCODE_EXECUTION_PORT=4104 node harness/server.mjs
# Open http://localhost:4100/live.html
```

Run from the repository root after building and starting the CodeRunner fixture:

```sh
php harness/tests/compiler-recovery.php
python3 harness/tests/bridge.py
node harness/tests/functions.mjs
node harness/tests/adapters.mjs
node harness/tests/trace-schema.mjs
python3 harness/tests/native-cpp.py
python3 harness/tests/python-objects.py
python3 harness/tests/dap.py
python3 harness/tests/java-tracing.py
sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml exec -T --user www-data moodle php /fixture/runtime-test.php
sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml exec -T --user www-data moodle php /fixture/compiler-test.php
sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml exec -T --user www-data moodle php /fixture/attachments-test.php
sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml exec -T --user www-data moodle php /fixture/backup-test.php
cd harness
npx playwright install chromium firefox webkit
npx playwright test adapters.spec.js coderunner.spec.js breakpoints.spec.js connectors.spec.js clean-input.spec.js step-polish.spec.js visualizer-polish.spec.js functions.spec.js fallback.spec.js
```

Playwright launches the standalone harness when needed. Its WebKit checks are not
actual Safari certification. See [Operations](OPERATIONS.md) for architecture,
limits, troubleshooting and the maintained verification record.

## Build the installation bundle

After maintainer release verification passes, install the `zip` command, commit
the matching source and build the ZIP:

```sh
python3 harness/scripts/release-bundle.py
```

The result is `dist/vizcode-<plugin release>-bundle.zip`. `COMMIT` and `source.tar.gz`
identify its source; `SHA256SUMS` covers its contents. Generated assets, secrets,
upstream checkouts, local data and test output stay out of Git. Publish the bundle
as a GitHub release asset rather than committing its large runtime binaries.

## Adapter development

See [Adapters and API](ADAPTERS.md) for the JSON contract, registry configuration,
conformance examples and optional DAP profile. The demo installer builds the
Python/C++/Java defaults; the debugpy example image is an optional separate build.
