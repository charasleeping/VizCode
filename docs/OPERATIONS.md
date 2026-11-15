# Operations and verification

For setup, see [Installation](INSTALL.md).

## Components

`local_vizcode` owns only the editor, debugging services, authorized in-place
Check endpoint and best-response recording. Questions, test cases, templates,
penalties, support files and grading outcomes remain native CodeRunner data.
VizCode uses native CodeRunner question and attempt storage.

The reviewed bridge targets CodeRunner 5.10.9 and adaptive behaviour 1.4.8 at the
exact revisions in `upstreams.json`. Its manifest includes before/after SHA-256
checksums and exact substitutions. It adds the UI loader/specification and small
integration points in the renderer, question, sandbox and native behaviour. The
native behaviour component name is preserved when attempts are restored.

Best-response metadata is held in server-controlled native question-attempt
steps. It records earned score, originating step and the matching response/outcome.
Response-file objects are rehydrated from native recorded steps, not arbitrary
serialized client data. Prechecks/autosaves do not become best answers. Current
feedback remains the latest Check; finish commits the highest earned response,
with the latest winning equal earned scores. Native marking remains unchanged;
snapshot selection compares exact earned scores, without correctness tolerances.

The AJAX Check uses Moodle's normal quiz/preview action processing, ownership and
context checks, a per-question lock and sequence check. It grades once and returns
CodeRunner-rendered feedback. The client updates feedback/controls while keeping
the live editor and newer edits. No hidden tests or threshold metadata are supplied
to the debugger.

## Java isolation and limits

The execution broker validates a short-lived, one-use ticket tied to the precise
request. Moodle issues tickets only for an authorized editable VizCode question
supporting Java. Ticket signing and supervisor secrets are separate; neither is
included in language code or question configuration.

A private supervisor accepts only fixed Java tracing operations and launches a
fixed image. Each job has no network, no mounted host files, a read-only filesystem,
non-root UID, no added capabilities, no privilege escalation, 384 MB memory, one CPU,
64 processes/threads and a 64 MB temporary filesystem. The trusted supervisor alone
can access Docker; its API is not published. Use a dedicated or suitably isolated
Docker host for production.

The JDI controller compiles with debug information and disables annotation
processing. It reads frames, fields and arrays directly without invoking student
getters or `toString()`. Requests support at most 100,000 characters each of source,
local calls and input; traces are bounded to 1,000 steps, 2 MiB and 64 displayed
frames. Output is capped at 64 KiB. Execution has a 10-second deadline; the supervisor
has a 45-second total job deadline. There are at most two concurrent Java jobs and
40 Java requests per user per minute per broker instance.

Interactive input returns a bounded trace plus an input request, retires the job,
and replays accumulated input after the next response. `System.in.readAllBytes()`
requests whole input. Scanner/BufferedReader line/token reads request more input
when needed. Blank lines remain input; multiline submissions finish the supplied
Java stream. There is no visible input history. Edits and navigation abort obsolete
requests and their jobs; no execution timer runs while waiting for input.

This first deployment supports one broker/supervisor instance. Ticket replay/rate
state is in memory; replicas would require shared state or routing guarantees.
Java debugging is limited to single-file, single-thread console programs; native
CodeRunner grading may support programs outside that debugging boundary.

## Troubleshooting

- **Bridge refusal:** verify exact versions and inspect local changes. Do not use
  force, bypass checksums or overwrite modified files. Remove a verified old bridge
  before upgrading either integration or upstream components.
- **No editor:** check Moodle caches and browser asset loading. The native textarea
  remains the fallback; CodeRunner's Ctrl+Alt+M UI toggle still works.
- **Unchanged preloaded answer:** this is native CodeRunner validation. Students
  must edit the answer before Check; initial debugging does not grade it.
- **Debugging unavailable:** inspect the displayed diagnostic. For service failures,
  verify the broker URL, separate hostname, frame ancestor, HTTPS proxy, service
  health, signing key and private supervisor access. Updates retry automatically.
- **Java jobs cannot start:** verify `vizcode-java-job:21` exists in the supervisor's
  Docker engine and that the configured socket is accessible. The browser broker
  and Moodle must not receive that socket.
- **Compilation failed:** distinguish syntax diagnostics from an internal compiler
  crash. Known internal crashes retry once and are never cached as wrong answers
  after repeated failure. Server logs retain the infrastructure diagnostic's first
  line; normal grading feedback follows native CodeRunner visibility rules.
- **CPU seems high:** process/JVM startup, batching, per-test fallback and nested
  compilers affect reported run totals. The measurement is not a function benchmark.
- **Docker disk full:** inspect storage; preserve containers and volumes containing
  user data. Increase Docker's disk allocation or remove confirmed-unused build
  images. Never delete database volumes to update this project.

## Verification record

The beta verification completed 27 frontend/integration checks in each of
Chromium, Firefox and WebKit (81 checks), including native Check, multilingual
drafts, Java tracing/input, connectors, breakpoints, dragging, diagnostics and
reduced motion. Firefox ran in native ARM64 Linux because the host macOS
environment refused to launch its Firefox process. WebKit is not actual Safari;
actual Safari remains a separate manual verification item.

Additional checks cover native submission without JavaScript; bridge installation,
reapplication, removal and refusal of modified/unsupported installations; actual
Python/GCC crash retry and cache recovery; parser-only discovery; restricted Java
tracing and limits; native three-language grading; penalties, prechecks, unchanged
Checks and exact best-answer selection; unchecked final answers and outages;
response attachments across final save/reload; XML and course backup/restore.

A clean source checkout without installed dependencies or generated assets was
built successfully; its generated editor, discovery and Moodle loader assets
matched the working build. A separate empty Moodle database was installed using
the packaged plugin ZIP and pinned upstreams, using separate database
volumes. Verification uses local development accounts only, not a production site.
The executed container checks used ARM64 hardware. The supplied Dockerfiles build
for their host architecture; a separate AMD64 runtime run remains unverified.

The 81-check run predates the current three-language configuration. Subsequent
checks cover Python/C++/Java grading, multilingual selection, Question Bank
filtering and changed-answer warnings after in-place Check.
