#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
    umask 077
    python3 -c 'import secrets;print("VIZCODE_JAVA_KEY="+secrets.token_hex(32));print("VIZCODE_SUPERVISOR_KEY="+secrets.token_hex(32))' > .env
fi
compose() { sh ../compose.sh -f compose.yaml "$@"; }
compose build java-job jobe
compose up -d --build
if ! compose exec -T moodle test -f /var/moodleconfig/config.php; then
    compose cp config.php moodle:/var/moodleconfig/config.php
    compose exec -T moodle chown www-data:www-data /var/moodleconfig/config.php
    compose exec -T --user www-data moodle php admin/cli/install_database.php --agree-license --fullname=VizCode --shortname=VizCode --adminuser=admin --adminpass='LocalFixtureOnly1!' --adminemail=admin@example.invalid
else
    compose exec -T --user www-data moodle php admin/cli/upgrade.php --non-interactive
fi
compose exec -T --user www-data moodle php /fixture/setup.php
