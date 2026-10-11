<?php
namespace qtype_vizcode\local;
defined('MOODLE_INTERNAL') || die();

final class test_cases {
    public static function parse(string $json): array {
        $tests = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($tests) || !array_is_list($tests) || count($tests) < 1 || count($tests) > 20) {
            throw new \InvalidArgumentException('Provide between 1 and 20 tests.');
        }
        foreach ($tests as &$test) {
            if (!is_array($test) || !isset($test['expected']) || !is_string($test['expected'])) {
                throw new \InvalidArgumentException('Each test requires an expected output string.');
            }
            foreach (['code', 'stdin'] as $field) {
                $test[$field] = $test[$field] ?? '';
                if (!is_string($test[$field]) || strlen($test[$field]) > 100000) {
                    throw new \InvalidArgumentException('Invalid test source or stdin.');
                }
            }
            if (isset($test['hidden']) && !is_bool($test['hidden'])) {
                throw new \InvalidArgumentException('Test hidden must be a boolean.');
            }
            $test['hidden'] = $test['hidden'] ?? true;
        }
        return $tests;
    }

    public static function normalize(string $output): string {
        return rtrim(str_replace(["\r\n", "\r"], "\n", $output), "\n");
    }
}