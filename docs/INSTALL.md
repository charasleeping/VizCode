# Install VizCode on an existing CodeRunner site

This repository currently contains source only, with no published release bundle.
Use a bundle supplied by the maintainer when available; source-build instructions
are in the [development guide](DEVELOPMENT.md). A prepared bundle includes
`plugins/vizcode.zip`, built runtime assets, the integration bridge, backend build
files, matching source, notices and SHA-256 checksums. Moodle records the plugin
installation and configuration through its normal upgrade process. The bundle
includes no Moodle database and creates no accounts.

You need Moodle administrator access, filesystem access to its server, Python 3
for the bridge installer, and Docker Engine with Compose on the execution host.
Prepare a separate HTTPS hostname and reverse proxy for that execution service.
Verify the bundle with `sha256sum -c SHA256SUMS` or an equivalent SHA-256 tool.

1. Back up the site and put it in maintenance mode. Verify the supported versions
   in the [README](../README.md#requirements). Install the pinned CodeRunner and
   adaptive behaviour first if needed.
2. Install `plugins/vizcode.zip` using **Site administration → Plugins → Install
   plugins**, or extract it as `<moodle>/local/vizcode`. Complete Moodle's plugin
   upgrade. An administrator with filesystem access must apply the bridge:

   ```sh
   python3 /path/to/moodle/local/vizcode/bridge/install.py --moodle /path/to/moodle
   python3 /path/to/moodle/local/vizcode/bridge/install.py --moodle /path/to/moodle --verify
   php /path/to/moodle/admin/cli/purge_caches.php
   ```

   Run the filesystem operations as the site's deployment user. The bridge
   verifies versions and file checksums before changing anything. It preserves
   original files as `*.vizcode.bridge-backup`, is idempotent, and refuses local
   modifications rather than overwriting them. It changes CodeRunner integration
   points, not Moodle core.
3. On the execution host, extract `backend` from the bundle. Install Docker Engine
   and Compose. Copy `.env.example` to `.env`, restrict it to the administrator,
   set the exact Moodle origin, and generate **two different secrets**:

   ```sh
   cd backend
   cp .env.example .env
   chmod 600 .env
   python3 -c 'import secrets; print(secrets.token_hex(32))'
   # Run twice: one value for VIZCODE_TRACE_KEY, another for VIZCODE_SUPERVISOR_KEY.
   # Edit .env: set the Moodle origin and both generated secrets before continuing.
   docker compose build java-job cpp-job
   docker compose up -d --build java-supervisor execution
   ```

   For Compose v1, use `docker-compose`. Java and native C++ run in disposable containers; its
   private supervisor requires access to the configured Docker socket. Keep that
   supervisor off public networks, ideally on a dedicated execution host. Neither
   Moodle nor the student-code container receives the Docker socket.
4. Put HTTPS in front of the execution service's loopback port **4102**. Use a
   separate hostname, for example `execute.example.edu`, and proxy both `/live/`
   and `/v1/` (plus `/java/trace` during the compatibility period). Keep the supervisor port private. Set the Moodle origin in
   `VIZCODE_MOODLE_ORIGIN` so only the intended site may embed the broker.
5. In **Site administration → Plugins → Local plugins → VizCode for CodeRunner**,
   set the broker URL, for example
   `https://execute.example.edu/live/broker.html`, and set the tracing signing key to
   the same `VIZCODE_TRACE_KEY` value. The supervisor secret is never entered into
   Moodle or questions.
6. Keep the existing CodeRunner Jobe settings. Ensure Python, C++ and Java 21
   are available. If a grader is needed, the bundle optionally supplies one:

   ```sh
   docker compose --profile grader up -d --build grader
   ```

   Configure CodeRunner to reach its port 4114 through the site's private backend
   network. Do not publicly expose an unrestricted Jobe service.
7. Edit a CodeRunner question, enable customisation, and select **VizCode** under
   **UI plugin**. Use native `python3`, `cpp_function`/`cpp_program`,
   `java_method`/`java_class`/`java_program` or a suitable multilingual prototype.
   Existing questions using Ace, Graph or other interfaces are unaffected.
8. Preview a question, edit the preloaded answer, Check it, then finish an attempt
   and verify that the teacher sees the answer earning its retained mark. Leave
   maintenance mode after verification.

CodeRunner requires an edit to preloaded answers before they are gradable; VizCode
retains that native rule. Debugging can still trace preloaded source immediately.

### Upgrades and removal

Before updating CodeRunner or this integration, enter maintenance mode, verify the
old bridge, and **remove it using the old installed installer**:

```sh
python3 /path/to/moodle/local/vizcode/bridge/install.py --moodle /path/to/moodle --remove
```

Update only to a supported, reviewed combination; install the new bridge, run its
verification, upgrade Moodle and purge caches. Never restore backups over
unrecognized local changes. Remove the bridge before uninstalling `local_vizcode`.
Completed submitted sources remain ordinary CodeRunner responses. Avoid removing
VizCode during active attempts that still need its best-answer recording.

For service limits and troubleshooting, see [Operations](OPERATIONS.md).
