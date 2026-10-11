#!/bin/sh
set -eu
cd "$(dirname "$0")"
docker-compose -f compose.independent.yaml up -d --build
if ! docker-compose -f compose.independent.yaml exec -T moodle test -f /var/moodleconfig/config.php; then
    docker-compose -f compose.independent.yaml cp dev-config.php moodle:/var/moodleconfig/config.php
    docker-compose -f compose.independent.yaml exec -T moodle chown www-data:www-data /var/moodleconfig/config.php
fi
docker-compose -f compose.independent.yaml exec -T --user www-data moodle php admin/cli/install_database.php \
    --agree-license \
    --fullname=VizCode --shortname=VizCode --adminuser=admin --adminpass='LocalFixtureOnly1!' \
    --adminemail=admin@example.invalid
docker-compose -f compose.independent.yaml exec -T --user www-data moodle php /fixture/vizcode-setup.php