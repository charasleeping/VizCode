#!/bin/sh
# Local group-testing environment. Never deletes database volumes.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
compose() { sh harness/compose.sh -f harness/coderunner-fixture/compose.yaml "$@"; }
usage() {
    cat <<'HELP'
Usage: sh harness/demo.sh setup|start|stop|status
  setup   Install locked dependencies, build from source, and prepare demo Moodle.
  start   Restart an already prepared demo without rebuilding.
  stop    Stop the demo, retaining accounts, questions and attempts.
  status  Show service status.
Open http://localhost:4115 after startup. See docs/TEAM-TESTING.md.
HELP
}
case "${1:-help}" in
    help|--help|-h) usage; exit 0 ;;
    setup|start|stop|status) action=$1 ;;
    *) usage >&2; exit 2 ;;
esac
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    printf '%s\n' 'Start Docker Desktop or your Docker engine, then run this command again.' >&2
    exit 1
fi
compose version >/dev/null
case "$action" in
    setup)
        for dependency in git node npm python3; do
            if ! command -v "$dependency" >/dev/null 2>&1; then
                printf 'Install %s first; see docs/TEAM-TESTING.md.\n' "$dependency" >&2; exit 1
            fi
        done
        if [ "$(node -p 'Number(process.versions.node.split(".")[0]) >= 22')" != true ]; then
            printf '%s\n' 'Node.js 22 or later is required; Node.js 22 is the tested version.' >&2; exit 1
        fi
        npm ci --prefix plugin/vizcode/frontend
        npm ci --prefix harness
        node harness/scripts/bootstrap.mjs
        node harness/scripts/build-vizcode.mjs
        sh harness/coderunner-fixture/install.sh
        ;;
    start)
        if [ ! -f harness/coderunner-fixture/.env ]; then
            printf '%s\n' 'Run sh harness/demo.sh setup once before using start.' >&2; exit 1
        fi
        compose up -d --no-build
        ;;
    stop) compose stop; exit 0 ;;
    status) compose ps; exit 0 ;;
esac
printf '\nDemo: http://localhost:4115/course/view.php?id=2\n'
printf 'Student: student / LocalStudentOnly1!\nTeacher: teacher / LocalTeacherOnly1!\n'
printf 'Administrator: admin / LocalFixtureOnly1!\n'
printf 'Stop safely: sh harness/demo.sh stop\n'
