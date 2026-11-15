"""Patch the pinned Jobe image; measurements never pass through student stdout."""
from pathlib import Path
root = Path('/var/www/html/jobe')
def replace(path, before, after):
    text = path.read_text()
    if text.count(before) != 1:
        raise RuntimeError(f'Upstream changed: expected one measurement patch site in {path}')
    path.write_text(text.replace(before, after))
p = root / 'runguard/runguard.c'
replace(p, 'fprintf(outputfile,"%.3f\\n",userdiff+sysdiff)',
    'fprintf(outputfile,"{\\"runtime_ms\\":%.3f,\\"memory_mb\\":%.6f}\\n",viz_cpu_time_ms(),viz_peak_memory_mb())')
replace(p, 'void output_exit_time(int exitcode, double timediff)\n{', '''static double viz_cpu_time_ms(void) {
    struct rusage usage;
    if (getrusage(RUSAGE_CHILDREN, &usage) != 0) return -1;
    return 1000.0 * (usage.ru_utime.tv_sec + usage.ru_stime.tv_sec)
        + (usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) / 1000.0;
}
static double viz_peak_memory_mb(void) {
    struct rusage usage;
    if (getrusage(RUSAGE_CHILDREN, &usage) != 0) return -1;
    return (double)usage.ru_maxrss * 1024.0 / 1000000.0;
}
void output_exit_time(int exitcode, double timediff)
{''')
replace(p, 'fopen(timefilename,"w")', 'fopen(timefilename,"r+")')
p = root / 'app/Libraries/LanguageTask.php'
replace(p, "'cputime'       => 2,       // secs", "'cputime'       => 30,      // secs; compilation is separate from student runtime")
replace(p, '    public float $time = 0;', '    public ?float $runtime_ms = null;\n    public ?float $memory_mb = null;\n    public float $time = 0;')
replace(p, '        $sandboxCommandBits = [', '''        // tempnam creates a web-server-owned 0600 file outside the job directory.
        // The low-privilege student process cannot replace or modify this file.
        $measurementfile = tempnam(sys_get_temp_dir(), 'vizcode-metrics-');
        if ($measurementfile === false) throw new \\RuntimeException('Cannot create measurement file');
        chmod($measurementfile, 0600);
        $sandboxCommandBits = [''')
# The executable must stay first in the command, so append the option after the array.
replace(p, "        // Prepend CPU pinning command if enabled", "        $sandboxCommandBits[] = '--outtime=' . escapeshellarg($measurementfile);\n\n        // Prepend CPU pinning command if enabled")
replace(p, "        exec('bash prog.cmd');", '''        try {
            exec('bash prog.cmd');
            if (!$iscompile) {
                $measurements = json_decode((string)file_get_contents($measurementfile), true);
                if (is_array($measurements) && ($measurements['runtime_ms'] ?? -1) >= 0 && ($measurements['memory_mb'] ?? -1) >= 0) {
                    $this->runtime_ms = (float)$measurements['runtime_ms'];
                    $this->memory_mb = (float)$measurements['memory_mb'];
                }
            }
        } finally { unlink($measurementfile); }''')
replace(p, '            $this->filteredStderr()\n        );', '            $this->filteredStderr(),\n            $this->runtime_ms, $this->memory_mb\n        );')
p = root / 'app/Libraries/ResultObject.php'
replace(p, '    public string $stderr;', '    public string $stderr;\n    public ?float $runtime_ms;\n    public ?float $memory_mb;')
replace(p, "        $stderr = ''\n", "        $stderr = '',\n        $runtime_ms = null,\n        $memory_mb = null\n")
replace(p, '        $this->run_id = $run_id;', '        $this->runtime_ms = $runtime_ms;\n        $this->memory_mb = $memory_mb;\n        $this->run_id = $run_id;')
