<?php
namespace local_vizcode;
defined('MOODLE_INTERNAL') || die();

/** A compiler process crash is not a student's syntax error. */
final class compiler_recovery {
    public static function execute(callable $run): array {
        for ($attempt=0;$attempt<2;$attempt++) {
            $result=$run();
            $crashed=self::is_crash($result);
            if (!$crashed) return $result;
        }
        // This propagates before report caching or attempt/penalty commitment.
        $diagnostic=trim($result['cmpinfo'] ?? '');
        error_log('VizCode: compiler process crashed after one retry: '.strtok($diagnostic, "\r\n"));
        throw new \moodle_exception('gradingunavailable','local_vizcode');
    }
    public static function is_crash(array $result): bool {
        $diagnostic=trim($result['cmpinfo'] ?? '');
        // Match only the complete infrastructure diagnostic, never source
        // excerpts or a student's printed output containing these words.
        $bare=preg_match('/^(?:qemu: uncaught target signal 11 \(Segmentation fault\) - core dumped\s*)?Segmentation fault(?: \(core dumped\))?$/i',$diagnostic);
        // GCC can report a failed compiler/linker subprocess with extra
        // report-bug instructions, rather than a bare shell diagnostic.
        $gcc=preg_match('/^(?:g\+\+|gcc|cc1plus|cc1|collect2|lto1): internal compiler error: [^\r\n]*(?:Segmentation fault|Bus error|Aborted)[^\r\n]*(?:\r?\n(?:Please submit a full bug report[^\r\n]*|with preprocessed source[^\r\n]*|See <[^\r\n]*> for instructions\.|\s*))*$/i',$diagnostic);
        return ($result['outcome'] ?? null)===11 && (bool)($bare || $gcc);
    }
}
