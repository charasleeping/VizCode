# VizCode

VizCode is an independent Moodle question type for Python, with automatic live
execution tracing and direct Jobe grading.

## Run Locally

Install Node.js 22, npm, Git, then clone the repository:

```sh
git clone <repository-url> VizCode
cd VizCode
npm ci --prefix plugin/vizcode/frontend
npm ci --prefix harness
node harness/scripts/build-vizcode.mjs
```

Start the local editor and isolated execution hosts in a terminal:

```sh
npm start --prefix harness
```

Open http://localhost:4100/live.html. Keep that terminal running while you use
the page. The process also serves the isolated execution broker on
http://127.0.0.1:4101. Stop it with Ctrl+C. These development servers bind for
local testing; do not expose them to the internet or use them as production hosting.

### Optional Moodle/Jobe Fixture

To run the actual Moodle question, install Docker and Docker Compose, then run:

```sh
node harness/scripts/bootstrap.mjs
node harness/scripts/build-vizcode.mjs
sh harness/moodle-fixture/install-vizcode.sh
```

`install-vizcode.sh` performs Moodle's first-time database installation and is
only for a fresh fixture database. Open http://localhost:4112/mod/quiz/view.php?id=1
and log in with the local-only student account `student` / `LocalStudentOnly1!`.
Do not rerun the first-install script against an existing database. For the
already-installed development fixture, preserve its volumes and run:

```sh
docker-compose -f harness/moodle-fixture/compose.independent.yaml up -d --build
docker-compose -f harness/moodle-fixture/compose.independent.yaml exec -T --user www-data moodle php admin/cli/upgrade.php --non-interactive
docker-compose -f harness/moodle-fixture/compose.independent.yaml exec -T --user www-data moodle php /fixture/vizcode-setup.php
```

The Moodle/Jobe fixture runs separately from the Node harness; start both when
testing live traces inside Moodle. Fixture credentials and settings are not for
deployment.

The plugin source is [plugin/vizcode/README.md](plugin/vizcode/README.md). Build its ZIP
with `node harness/scripts/build-vizcode.mjs --zip` after installing the frontend
dependencies. See [docs/INSTALL.md](docs/INSTALL.md) for installation, deployment
CSP, tests, and remaining release gates. Vendored OPT tracer/visualizer and its
notices remain.
