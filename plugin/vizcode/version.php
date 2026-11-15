<?php
// SPDX-License-Identifier: GPL-3.0-or-later
defined('MOODLE_INTERNAL') || die();
$plugin->component = 'local_vizcode';
$plugin->version = 2026111600;
$plugin->requires = 2024100700;
$plugin->supported = [405,405];
$plugin->maturity = MATURITY_BETA;
$plugin->release = '1.0.0-beta.2';
$plugin->dependencies = ['qtype_coderunner'=>2026110201, 'qbehaviour_adaptive_adapted_for_coderunner'=>2026092401];
