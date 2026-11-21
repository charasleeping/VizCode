# Tracing adapters

VizCode renders traces independently of the debugger that produced them. Python,
C++ and Java are built-in adapters. Administrators can register other languages
without editing or rebuilding the visualization frontend.

## Integration choices

| Route | What you provide |
| --- | --- |
| HTTP | A self-hosted service accepting JSON requests and returning a trace document |
| Executable | An installed container image whose command reads one JSON request from stdin and writes one JSON response to stdout, delimited by EOF |
| DAP | An installed image containing a DAP debugger and the supplied generic DAP runner/profile |

Use any implementation language that can read and write JSON. The Python and
Node.js examples under `examples/adapters` implement the same tiny integer-sum
example language. They do not depend on VizCode libraries or enable JavaScript as
a student language.

The [OpenAPI document](../api/v1/openapi.json) describes the service operations;
[trace.schema.json](../api/v1/trace.schema.json) describes the trace format.
Run `node harness/tests/adapters.mjs` from the repository root for the executable
examples and the common value/reference contract checks.

For an end-to-end example, build the integer-sum image with
`docker build -t vizcode-counter-job:1 -f examples/adapters/Dockerfile.python examples/adapters`,
append its registration to the built-ins in your registry, then start the development
harness with `VIZCODE_ADAPTER_REGISTRY=/absolute/path/to/registry.json VIZCODE_EXECUTION_PORT=4104 node harness/server.mjs`.
Run `node harness/tests/tracing-api.mjs` and the `adapters.spec.js` browser tests.

## Register an adapter

Create a registry JSON array on the execution-service host. Start from
`examples/adapters/registry.example.json`, replacing its examples with your
installed adapters and keeping the built-ins you want from
`services/tracing/registry.mjs`. Set `VIZCODE_ADAPTER_REGISTRY` to its absolute path
in both the execution and supervisor containers and mount that file read-only.
The registry is loaded at service startup; restart both services after changes.

For example, an additional Compose file can mount a host-side `adapters.json`:

```yaml
services:
  execution:
    environment:
      VIZCODE_ADAPTER_REGISTRY: /etc/vizcode/adapters.json
    volumes: ["./adapters.json:/etc/vizcode/adapters.json:ro"]
  java-supervisor:
    environment:
      VIZCODE_ADAPTER_REGISTRY: /etc/vizcode/adapters.json
    volumes: ["./adapters.json:/etc/vizcode/adapters.json:ro"]
```

Apply it with `docker compose -f compose.yaml -f adapters.compose.yaml up -d`.

Each entry declares `id`, `version`, `label`, `languages`, `transport`, `profiles`
and `capabilities`. Container entries require `image`; executable and DAP entries
also require an administrator-defined `command` array. HTTP entries require a
self-hosted `url`; an optional `keyEnv` names its server-side authorization secret.
Set that secret's environment variable on the supervisor only.
Do not configure third-party Internet endpoints for tracing.

Language aliases must be unique across the enabled registry. The built-ins use
`auto` source profiles. An additional profile must be explicitly declared before
API callers can select it. Student editor requests use `auto`.

CodeRunner still decides which languages a question accepts and how they are
graded. Installing an adapter does not install a CodeRunner grading language.
Unknown highlighting modes use plain text; callable discovery is optional.

## HTTP execution API

1. `GET /v1/adapters` returns public descriptors without image names, commands or secrets.
2. `POST /v1/traces` creates a trace; `POST /v1/discover` creates a non-executing discovery job.
3. Both POST operations return HTTP 202 with `id` and a private `token`.
4. Poll `GET /v1/traces/{id}` using `Authorization: Bearer <token>` until `complete` or `failed`.
5. `DELETE /v1/traces/{id}` cancels and removes the job using the same private token.

Trace creation requires a single-use, source-bound Moodle ticket obtained through
`local_vizcode_trace_ticket`. Its SHA256 hash covers the exact UTF-8 JSON request-body bytes (including whitespace),
including adapter ID/version, language, source profile, code and debugging state.
Serialize the body once, hash those bytes, and send the same bytes. This avoids
language-specific JSON canonicalization requirements.
Never expose the signing key to the browser. Student requests cannot choose
container images, executable commands or service URLs.

An adapter receives `code`, `scratchCode` (generated local calls), `stdin`,
`inputEof`, `interactiveInput`, `functions`, `language`, `adapterId`,
`adapterVersion` and `sourceProfile`. `diagnose` requests must compile/parse only,
without running the answer. The graded answer is always the original answer;
local calls and input are never part of CodeRunner submission serialization.
Declare `capabilities.diagnostics` only when that non-executing operation is
implemented; the service rejects diagnostic requests otherwise.

Custom HTTP/executable adapters return the versioned trace document directly.
Built-ins may use the compatibility converter internally. Discovery responses
contain `valid`, `locked`, `rows`, and optionally generated `source` and its row-ID
`mapping`. Declare a `discoverUrl` or isolated `discoveryCommand` before enabling
remote discovery. Discovery must never execute the answer or argument expressions.

## Values, identity and input

- `code` is the original answer. Source locations identify `answer` or `calls`.
- Frames and object nodes have opaque string IDs. Object IDs denote semantic
  identity for the lifetime of the object within one trace; they are not addresses.
- Values distinguish primitives, exact large integers, references, unavailable,
  unsupported, expired and truncated data. All references must resolve in the
  event's object map.
- Objects use `kind`, `type`, `fields` and/or `items`. Return events distinguish
  `value`, `void`, `unavailable` and `exceptional` outcomes.
- Capture immutable snapshots. Never reuse a mutable snapshot for earlier steps.
- `inputRequest` contains `kind` (`line` or `all`), `prompt` and the paused `step`.
  End the job while waiting. The next request replays accumulated input; an empty
  line and explicit EOF are different states.
- Respect 1,000 steps, 64 frames, 64 KiB stdout, bounded object traversal and the
  service's response-size/time/memory limits. Report truncation explicitly.

DAP handles are inspection handles valid at a stop, not durable object identities.
The generic connector therefore advertises identity and return capture as
unsupported. It renders bounded structured values with that limitation visible.
An optional language-specific extension can supply richer, verified data through
the same JSON API; it need not be written in JavaScript or TypeScript.
The debugger/profile is responsible for making variable inspection non-executing;
DAP itself cannot guarantee that a third-party debugger avoids evaluating getters
or formatting hooks. Review that behavior before enabling an additional profile.

## Optional debugpy profile

Build `vizcode-debugpy-job:1` using
`services/tracing/adapters/Dockerfile.debugpy`, then use the example registry's
`python-debugpy` entry instead of `python-pyodide`. Both claim Python aliases, so
do not enable both simultaneously. The profile supports complete Python programs,
stepping, locals and stdout. Automatic calls, interactive input, durable object
identity and return capture are not advertised by this generic profile.
This optional interoperability example uses debugpy's own variable inspection,
which can invoke Python formatting hooks/properties. Use the default Pyodide
adapter for the verified stored-field inspection behavior; do not treat this
example as a drop-in replacement with identical semantics.

```sh
docker build -t vizcode-debugpy-job:1 -f services/tracing/adapters/Dockerfile.debugpy services/tracing/adapters
```

The supervisor is private and holds Docker access. It launches network-disabled,
read-only, bounded jobs with no host project mounts or Docker socket. The native
C++ job additionally needs executable temporary storage and container-scoped
ptrace permission. Never expose the supervisor port publicly.
