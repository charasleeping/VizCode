<h1 align="center">VizCode</h1>

<h3 align="center">Help students see how their code works.</h3>

<p align="center">
  A visual editor and live debugger for Moodle CodeRunner questions.<br>
  Step through Python, C++ and Java programs, and inspect variables, objects and output.
</p>

<p align="center">
  <a href="docs/INSTALL.md"><img src="https://img.shields.io/badge/Moodle-4.5-f98012?style=flat-square&amp;logo=moodle&amp;logoColor=white" alt="Moodle 4.5"></a>
  <a href="docs/INSTALL.md"><img src="https://img.shields.io/badge/CodeRunner-5.10.9-2878b5?style=flat-square" alt="Requires CodeRunner 5.10.9"></a>
  <a href="docs/INSTALL.md"><img src="https://img.shields.io/badge/PHP-8.3-777bb4?style=flat-square&amp;logo=php&amp;logoColor=white" alt="PHP 8.3"></a>
  <a href="docs/USAGE.md#languages-and-limitations"><img src="https://img.shields.io/badge/languages-Python%20%7C%20C%2B%2B%20%7C%20Java-16856b?style=flat-square" alt="Languages: Python, C++, Java"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-689f38?style=flat-square" alt="License: GPL-3.0-or-later"></a>
</p>

<p align="center">
  <a href="docs/INSTALL.md">Installation</a> ·
  <a href="docs/TEAM-TESTING.md">Group testing</a> ·
  <a href="docs/USAGE.md">Usage</a> ·
  <a href="docs/DEVELOPMENT.md">Local development</a> ·
  <a href="docs/OPERATIONS.md#troubleshooting">Troubleshooting</a>
</p>

VizCode requires CodeRunner, which manages question authoring, tests, templates,
grading and penalties. Enable VizCode on an existing question by changing its
UI plugin setting; keep the question's existing tests and grading template.

## Group project — try it locally

For Agentic Coding groupmates, the demo sets up Moodle, CodeRunner, VizCode and
sample questions on your own computer. Install Git, Node.js 22/npm, Python 3 and
Docker with Compose; start Docker before running. For a computer without these
tools, use the [copy-and-paste installation blocks](docs/TEAM-TESTING.md#copy-and-paste-prerequisite-installation)
for your operating system instead:

```sh
git clone https://github.com/charasleeping/VizCode.git
cd VizCode
sh harness/demo.sh setup
```

Open [the demo course](http://localhost:4115/course/view.php?id=2) and log in as
`student` with `LocalStudentOnly1!`. The repository owner must grant groupmates
access while the repository is private.

The [group testing guide](docs/TEAM-TESTING.md) includes Windows/macOS/Linux setup,
teacher/admin accounts, stop/restart commands and a short testing checklist.
[Copy-ready examples](docs/TEAM-EXAMPLES.md) cover Python, C++ and Java.

## Requirements

These are the external platform requirements. `1.0.0-beta.2` is VizCode's own
development version, not another dependency to install. The local demo supplies
the platform versions below through its pinned sources and containers:

| Component | Supported version |
| --- | --- |
| Moodle | 4.5 |
| PHP | 8.3 |
| CodeRunner | 5.10.9 |
| CodeRunner adaptive behaviour | 1.4.8 |

The integration bridge checks exact upstream versions and file checksums.
See [pinned revisions](upstreams.json); other combinations require a reviewed
bridge update.

## Administrator — install once

Administrator access to Moodle and the server filesystem is required.
Uploading the plugin ZIP is one part of the installation.

1. Get the installation bundle. It includes `plugins/vizcode.zip`, the bridge,
   execution-service build files, source and checksums. This repository currently
   contains source only; use a bundle supplied by the maintainer when available.
   See [local development](docs/DEVELOPMENT.md) for source-build instructions.
2. Install the plugin through Site administration → Plugins → Install plugins.
3. Apply and verify the bridge using the included installer on the Moodle server.
4. Start the execution service on a separate HTTPS hostname. Configure its URL
   in Site administration → Plugins → Local plugins → VizCode for CodeRunner.
   Java debugging also uses the included Java service and a shared signing key.
5. Preview a question, try debugging and Check, then verify a sample submission.

Follow the [complete installation steps](docs/INSTALL.md) for commands,
service settings and verification. Existing sites can continue using their Jobe
grading server; the bundle's supplied grader is optional.

## Teacher — enable on an existing question

After the administrator completes setup:

1. Open the course's Question bank and edit a CodeRunner question.
2. Enable Customise.
3. Set UI plugin → VizCode.
4. Save and preview the question.

Your existing tests, expected outputs and grading settings remain in CodeRunner.
Questions with specialized interfaces or custom language templates need individual
review. There is currently no bulk-enabling tool.

CodeRunner's multilanguage questions are supported. Configure the question for
Python, C++ and/or Java; VizCode provides language buttons for students.
See [question setup](docs/USAGE.md#question-setup).

## Languages and debugging

| Language | Live debugging |
| --- | --- |
| Python | Python 3.14.2 through Pyodide |
| C++ | C++17 through WebAssembly Clang |
| Java | OpenJDK 21 service; single-file, single-thread console programs |

Students get breakpoints, step controls, function-call rows, interactive input and
an Output panel. Check updates results without reloading the page. Final
submission retains the answer earning the highest penalty-adjusted score within
the attempt; the latest answer wins ties.

C++ return steps currently do not display the returned value. Assign the result
to a variable or print it to inspect it. Debugging dependencies can differ from
those installed on the grading server. See [usage and limitations](docs/USAGE.md).

## Documentation

| Guide | For |
| --- | --- |
| [Installation](docs/INSTALL.md) | Administrators adding VizCode to an existing CodeRunner site |
| [Usage](docs/USAGE.md) | Teachers configuring questions and students using the debugger |
| [Group testing](docs/TEAM-TESTING.md) | One-command local demo, accounts and a feature checklist |
| [Development](docs/DEVELOPMENT.md) | Fresh-computer setup, demo accounts, builds and tests |
| [Operations](docs/OPERATIONS.md) | Service limits, troubleshooting and verification coverage |

## License

Original contributions are GPL-3.0-or-later. See [LICENSE](LICENSE),
[COPYRIGHT.md](COPYRIGHT.md) and [third-party notices](plugin/vizcode/THIRD_PARTY_NOTICES.md).
