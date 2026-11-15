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

### Copy-and-paste prerequisite installation

Choose your operating system below. These commands install software on your
computer and may request your administrator password. Complete installer prompts;
Windows may require a restart. Repository access is still required.
These recipes follow upstream installation instructions; they have not been
verified on fresh machines for every platform.

#### macOS — Terminal

Install Homebrew if absent, then the tools. Docker Desktop includes Compose.

```sh
sudo -v
/bin/bash <<'SETUP'
set -e
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
brew install git node@22 python
if [ ! -d /Applications/Docker.app ]; then
  brew install --cask docker-desktop
fi
export PATH="$(brew --prefix node@22)/bin:$PATH"
open -a Docker
printf 'Complete Docker Desktop setup. Waiting for Docker to become ready...\n'
until docker info >/dev/null 2>&1; do sleep 3; done
git clone https://github.com/charasleeping/VizCode.git
cd VizCode
sh harness/demo.sh setup
SETUP
```

For later sessions, run `export PATH="$(brew --prefix node@22)/bin:$PATH"`
if Node.js 22 is not on your PATH. Follow Homebrew's printed shell-configuration
instructions if `brew` is unavailable in a new terminal.

#### Windows — three short stages

For a fresh setup, use these three stages. Skip software that is already
installed. These Windows commands have not been tested on a fresh Windows
computer.

1. In administrator PowerShell, install Ubuntu and Docker Desktop:

```powershell
wsl --install -d Ubuntu-24.04
winget install --exact --id Docker.DockerDesktop
```

Complete installation and restart Windows if requested before continuing.

2. In PowerShell under the same Windows account, select Ubuntu, start Docker,
   and open the Ubuntu terminal:

```powershell
wsl --set-default Ubuntu-24.04
$dockerDesktop = @(
  "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
  "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $dockerDesktop) { throw "Install Docker Desktop before continuing." }
Start-Process $dockerDesktop
wsl -d Ubuntu-24.04
```

Create your Ubuntu username/password when prompted. Complete Docker's first-launch
prompts and wait until Docker is running. Selecting Ubuntu as the default normally
enables [Docker's WSL integration](https://docs.docker.com/desktop/features/wsl/).

3. Paste this into Ubuntu, not PowerShell, to install the remaining tools and
   start the demo. Run it from your Ubuntu home directory, not a Windows folder:

```sh
bash <<'SETUP'
set -e
cd ~
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3 build-essential
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  git clone --branch v0.40.3 --depth 1 https://github.com/nvm-sh/nvm.git "$NVM_DIR"
fi
. "$NVM_DIR/nvm.sh"
nvm install 22
docker info >/dev/null
docker compose version
git clone https://github.com/charasleeping/VizCode.git
cd VizCode
sh harness/demo.sh setup
SETUP
```

Continue at [Try the features](#3-try-the-features) after setup finishes.
For later sessions, use [Daily use](#daily-use); do not repeat installation.


#### Ubuntu 24.04 — native Linux

This installs Node.js 22 using nvm. On native Ubuntu only, when Docker is absent,
it uses Docker's development convenience installer and enables Docker access for
your user. That access grants control of the local Docker engine.
On WSL, enable Docker Desktop integration instead of installing another engine.

```sh
bash <<'SETUP'
set -e
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3 build-essential
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  git clone --branch v0.40.3 --depth 1 https://github.com/nvm-sh/nvm.git "$NVM_DIR"
fi
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
if grep -qi microsoft /proc/sys/kernel/osrelease; then
  docker info >/dev/null 2>&1 || {
    echo 'Start Docker Desktop and enable Ubuntu WSL integration, then rerun this block.'
    exit 1
  }
else
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com -o /tmp/vizcode-get-docker.sh
    sudo sh /tmp/vizcode-get-docker.sh
  fi
  sudo systemctl start docker
  if ! docker info >/dev/null 2>&1; then
    sudo usermod -aG docker "$(id -un)"
    echo 'Log out and back in, then rerun this block to activate Docker access.'
    exit 0
  fi
fi
docker compose version
git clone https://github.com/charasleeping/VizCode.git
cd VizCode
sh harness/demo.sh setup
SETUP
```

If a clone already exists, skip cloning and run `sh harness/demo.sh setup` inside
that directory after activating Node.js 22. Do not run the entire installation
block for everyday starts; use the Daily use commands below.

Installation references: [Homebrew](https://brew.sh/),
[Docker for macOS](https://docs.docker.com/desktop/setup/install/mac-install/),
[Docker for Windows](https://docs.docker.com/desktop/setup/install/windows-install/),
[WSL](https://learn.microsoft.com/en-us/windows/wsl/install),
[nvm](https://github.com/nvm-sh/nvm), and
[Docker for Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

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
