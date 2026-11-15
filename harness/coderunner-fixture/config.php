<?php
unset($CFG);global $CFG;$CFG=new stdClass();
$CFG->dbtype='mariadb';$CFG->dblibrary='native';$CFG->dbhost='database';$CFG->dbname='moodle';$CFG->dbuser='moodle';$CFG->dbpass='local-fixture-only';$CFG->prefix='mdl_';
$CFG->wwwroot='http://localhost:4115';$CFG->dataroot='/var/moodledata';$CFG->admin='admin';$CFG->directorypermissions=02777;
require_once('/var/www/html/lib/setup.php');
