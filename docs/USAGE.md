# Using VizCode

VizCode requires CodeRunner and the administrator setup in
[Installation](INSTALL.md). CodeRunner owns the tests and grading rules.

## Question setup

Edit a CodeRunner question in the Question bank, enable **Customise**, select
**UI plugin → VizCode**, then save and preview it. Supported native prototypes
include `python3`, `cpp_function`, `cpp_program`, `java_method`, `java_class` and
`java_program`. Existing tests and templates can remain in place.

For multilingual questions, use CodeRunner's native `multilanguage` prototype or
a suitable custom template handling `ANSWER_LANGUAGE`. Under **Advanced
customisation**, set **Ace language** to a comma-separated list such as
`python3,cpp,java`. The template must support every listed language; changing the
list alone does not make a single-language template multilingual. VizCode displays
language buttons and keeps local drafts per language.

CodeRunner requires an edit to preloaded answers before Check will grade them.
Debugging can trace preloaded source immediately.

## Debugging controls

| Action | Control |
| --- | --- |
| Previous / next step | Arrow buttons or Left / Right outside editable fields |
| Previous / next breakpoint | First / Last buttons or Shift+Left / Shift+Right; falls back to the trace boundary |
| Add a breakpoint | Click beside a line number |
| Select whole lines | Click or drag across line numbers |
| Run a detected function | Check its row and enter argument expressions in the answer's language |
| Reorder function calls | Drag the row handle or use keyboard reordering |
| Submit requested input | Enter or the arrow button |
| Enter multiple lines | Shift+Enter; the field expands automatically |

Function rows start unchecked. Blank optional arguments use their defaults.
Executable top-level code, or a C++/Java `main`, locks automatic calls. Write
complicated calls directly in the answer. Selected calls run sequentially,
sharing program state. The debugger never runs hidden teacher tests.

Frames and Objects show the selected step; Output appears when that step has
printed text. The previous visualization stays in place while tracing updates.
Unavailable debugging or an empty answer resets it. Editing retries tracing
automatically. Read-only review does not execute code.

## Check and submission

Check runs CodeRunner's grading and updates results in place. Native hidden-result
rules apply. Feedback uses green, yellow and red for correct, partial and incorrect
results where supported by the native feedback.

CodeRunner's different-answer warning appears when the answer differs from the
last checked answer. Checking the current answer clears it. Edits made during
grading remain in the editor; arriving feedback belongs to the submitted answer.

Final submission records the response earning the highest CodeRunner
penalty-adjusted score within the attempt; the latest wins equal earned scores.
Drafts stay editable during the attempt. Prechecks, autosaves and failed grading
operations do not become the best answer.

## Languages and limitations

| Language | Live debugger | Supplied grading environment |
| --- | --- | --- |
| Python | Python 3.14.2 / Pyodide | Python 3.14.4 |
| C++ | C++17 / native GCC and GDB service | GCC 15.2 |
| Java | OpenJDK 21 / JDI service | OpenJDK 21 |

Existing sites use their configured Jobe toolchains. The supplied Java services
currently install 21.0.13.0.3; patch versions come from OS repositories. To match
C++17 grading, configure `compileargs` as `["-std=c++17", "-Wall"]` where appropriate
for the selected CodeRunner prototype.

- C++ return steps show `__return__`. Callee locals whose storage has expired
  are not presented as live values. Locals not yet reliably available on the
  current source line are marked explicitly. Object inspection is bounded;
  custom allocators, placement construction, unions and arbitrary pointer
  reinterpretation do not receive a full-object guarantee.
  Register-held return objects can show their values while explicitly indicating
  that storage identity is unavailable.
- Python snapshots include stored instance fields and slots without calling
  properties or user formatting methods. Large integers retain their exact digits.
  Object identity is based on runtime IDs, with weak-reference lifetime checks
  where Python permits them; address reuse for non-weak-referenceable values
  between observed steps remains a limitation. Garbage-collection timing is not
  visualized.
- Java debugging supports single-file, single-thread console programs. Automatic
  calls support eligible static methods. Call private/instance methods and
  ambiguous overloads from the student's own program.
- Definitions alone trace definition steps. Select a supported function row or
  include a call in the answer to enter a function.
- Input appears when execution reaches a read. A multiline Java submission ends
  the supplied stream; whole-input reads request their input together.
- Standard-library teaching examples are the supported scope. Administrators
  manage grading dependencies in CodeRunner/Jobe. Installing a package there does
  not automatically make it available in the debugger.

## Execution measurements

CPU time and peak memory appear when the grading backend supplies them; otherwise
they display as unavailable. CPU is summed across measured sandbox runs; memory is
their highest peak. Process/JVM startup, batching and templates launching nested
compilers affect totals. These measurements are not function-only benchmarks.

Captured internal Python/GCC compiler crashes retry once before caching. Repeated
crashes remain ungraded and add no grading penalty. Ordinary syntax errors and
student runtime failures retain their native CodeRunner outcomes.

## Additional languages

Administrators may register self-hosted tracing adapters or DAP profiles using
[the adapter API](ADAPTERS.md). CodeRunner must independently support grading the
question language. Plain-text editing is available when highlighting is absent;
missing object-identity, return-value or input capabilities are shown in the editor.
