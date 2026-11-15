<?php
// SPDX-License-Identifier: GPL-3.0-or-later
defined('MOODLE_INTERNAL') || die();
function local_vizcode_before_standard_html_head() {
    global $PAGE,$CFG;
    $path=$PAGE->url->get_path();
    if (str_starts_with($path,'/mod/quiz/') || str_starts_with($path,'/question/')) {
        return '<link rel="stylesheet" data-vizcode-style="1" href="'.s($CFG->wwwroot.'/local/vizcode/styles.css').'">';
    }
    return '';
}
