# VizCode

An independent Moodle question type for Python programs and functions. It installs
as `question/type/vizcode` and does not require CodeRunner or its behavior plugin.

Students edit one source pane. After a 500 ms typing pause, browser-side execution
produces a step-by-step stack/heap trace. There are no Run or Stop buttons.
Scratch calls and Input are local-only, in a collapsed section. Moodle Check and
Submit grade the answer through Jobe using teacher-defined server-side tests.

Supported development target: Moodle 4.5 with PHP 8.3. This is an alpha plugin;
institutional deployment requires CSP/cookie isolation, grading-service and
third-party license review. See the workspace installation guide for instructions.

## Authoring

Select VizCode in Add a question. Choose Complete program or Function definitions.
Tests are a JSON array, with string `stdin`, `expected`, and optional `code` fields.
`hidden` is boolean and defaults to true. Function test code is appended only on
the grading server; it is never included in the local trace. For example:

```json
[
  {"code": "print(factorial(5))", "expected": "120\n", "hidden": false},
  {"code": "print(factorial(7))", "expected": "5040\n", "hidden": true}
]
```

All tests must pass for full marks. Output comparison normalizes CRLF/CR and
ignores trailing newlines, but not other whitespace. Question XML and Moodle
backup/restore carry the question's private tests. Student rendering and external
question definitions omit them. Browser results never assign marks.

## Administration

Configure the Jobe REST API base URL, optional Jobe API key, and isolated browser
execution broker URL under the VizCode question-type settings. Secrets remain
server-side. The broker must use a cookie-free host distinct from Moodle, with
the documented CSP applied to broker and worker responses. Serve the packaged
`execution-assets` on that host, not as authenticated Moodle execution.

The package is GPL-3.0-or-later; reused third-party sources retain their own
notices and licenses. Review THIRD_PARTY_NOTICES.md before redistributing.