# Group testing quick start

This guide runs a separate local Moodle + CodeRunner demo from source. You do not
need an existing Moodle site, a plugin release ZIP, or a host PHP/Java installation.

## 1. Prepare your computer

- Windows: use Ubuntu in WSL2, with Docker Desktop's WSL integration enabled.
  Run all commands inside WSL; clone into its Linux filesystem.
- macOS/Linux: use a terminal and Docker Desktop or a working Docker Engine.
- Install Git, Node.js 22 (with npm), Python 3, and Docker Compose.
- Start Docker. Allocate at least 6 GB RAM and allow 15 GB free Docker storage.
- First setup requires internet access and downloads Moodle, compiler assets and
  container images. It can take several minutes or longer on a slow connection.
- The GitHub repository is private. Ask the repository owner for access, then use
  your own GitHub authentication. Do not share tokens or passwords in the project.

## 2. Start the demo

```sh
git clone https://github.com/charasleeping/VizCode.git
cd VizCode
sh harness/demo.sh setup
```

The command installs locked dependencies, fetches pinned upstreams, builds the
editor, starts Docker services and creates the demo course/accounts. It generates
local service secrets automatically; these stay in an ignored `.env` file.
It does not create or publish a release bundle.

Open [Moodle](http://localhost:4115/login/index.php), then the
[demo course](http://localhost:4115/course/view.php?id=2).

| Role | Username | Password |
| --- | --- | --- |
| Student | `student` | `LocalStudentOnly1!` |
| Teacher | `teacher` | `LocalTeacherOnly1!` |
| Administrator | `admin` | `LocalFixtureOnly1!` |

These are shared development credentials for your local demo only. Do not use
this fixture or its default passwords on an internet-facing Moodle server.
Each groupmate runs their own instance; `localhost` always means their computer.

## 3. Try the features

1. Log in as student. Open VizCode CodeRunner quiz and start or continue an attempt.
2. Test Python, C++ and Java. Edit the preloaded answer (adding a comment is enough)
   before pressing Check; CodeRunner requires an edit to the preloaded answer.
3. Select the factorial function row, enter `5` and step through execution. Inspect
   Frames and Objects. For C++, assign or print a result to inspect it: return
   values are not yet displayed directly at the return step.
4. Set a breakpoint beside a line number. Try Left/Right and Shift+Left/Right
   outside the editor. Click or drag the line numbers to select whole lines.
5. Press Check. Verify results update without navigation. Change the function to
   return `0`, Check again, and observe the incorrect results. The final submitted
   answer retains the highest penalty-adjusted result within that attempt.
6. Open VizCode multilingual quiz. Switch between Python, C++ and Java, edit the
   drafts, and confirm switching back restores your draft.
7. Log in as teacher to inspect questions in the Question bank. The UI plugin is
   already set to VizCode; tests and grading remain native CodeRunner settings.

[Copy-ready examples](TEAM-EXAMPLES.md) include the three function answers,
complete multilingual programs and an interactive-input exercise. See
[Usage](USAGE.md) for all debugger controls.

## Daily use

Run from the project directory:

| Task | Command |
| --- | --- |
| Restart a prepared demo | `sh harness/demo.sh start` |
| Check services | `sh harness/demo.sh status` |
| Stop while keeping your work | `sh harness/demo.sh stop` |
| Rebuild after source changes | `sh harness/demo.sh setup` |

Start Docker before these commands. Stopping retains users, attempts and questions.
Do not delete Docker volumes to restart or update the demo. Updating does not
reset passwords on existing accounts or overwrite existing question answers.

## If something fails

| Symptom | What to check |
| --- | --- |
| Repository not found | Confirm repository access and your GitHub authentication. |
| Docker cannot connect | Start Docker Desktop/Engine; verify WSL integration on Windows. |
| Address already in use | Close the service using ports 4115 or 4102, or stop another copy of this demo. |
| Setup is still running | Keep the terminal open until setup prints the course link; initial builds and health checks take time. |
| Page unavailable | Run `sh harness/demo.sh status`; check service logs using the command below. |
| Debugger unavailable | Check execution and java-supervisor service health; wait for services to be ready. |
| Incorrect results for starter code | Edit the answer before Check; confirm you used the matching question/example. |

```sh
sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml logs --tail=60 moodle execution java-supervisor jobe
```

When reporting a problem to the group, include the language, steps, expected/actual
behaviour, commit (`git rev-parse --short HEAD`) and relevant logs. Remove secrets
and personal information before sharing logs; never commit `.env` or database data.
