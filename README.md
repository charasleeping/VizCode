# VizCode

VizCode is an independent Moodle question type for Python, with automatic live
execution tracing and direct Jobe grading.

Try the live harness at http://localhost:4100/live.html or the independent student
quiz at http://localhost:4112/mod/quiz/view.php?id=1. Student login: `student` /
`LocalStudentOnly1!` (local development only).

The plugin source is [plugin/vizcode/README.md](plugin/vizcode/README.md). Build its ZIP
with `node harness/scripts/build-vizcode.mjs --zip` after installing frontend
dependencies. See [docs/INSTALL.md](docs/INSTALL.md) for installation, deployment
CSP, tests, and remaining release gates. Vendored OPT tracer/visualizer and its notices 
remain.
