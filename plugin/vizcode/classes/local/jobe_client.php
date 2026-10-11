<?php
namespace qtype_vizcode\local;
defined('MOODLE_INTERNAL') || die();

final class jobe_client {
    public function execute(string $source, string $stdin): array {
        global $CFG;
        require_once($CFG->libdir . '/filelib.php');
        $base = rtrim((string)get_config('qtype_vizcode', 'jobeurl'), '/');
        $parts = parse_url($base);
        if (!$parts || empty($parts['host']) || !in_array($parts['scheme'] ?? '', ['http', 'https']) ||
                isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            throw new \moodle_exception('gradingunavailable', 'qtype_vizcode');
        }
        $client = new \curl();
        $headers = ['Content-Type: application/json', 'Accept: application/json'];
        $key = get_config('qtype_vizcode', 'jobeapikey');
        if ($key) {
            $headers[] = 'X-API-KEY: ' . $key;
        }
        $client->setHeader($headers);
        $body = json_encode(['run_spec' => [
            'language_id' => 'python3', 'sourcecode' => $source, 'input' => $stdin,
            'parameters' => ['cputime' => 5, 'memorylimit' => 128, 'streamsize' => 65536],
        ]], JSON_THROW_ON_ERROR);
        $raw = $client->post($base . '/runs', $body, [
            'CURLOPT_CONNECTTIMEOUT' => 5, 'CURLOPT_TIMEOUT' => 15,
            'CURLOPT_FOLLOWLOCATION' => false,
        ]);
        $result = json_decode((string)$raw, true);
        if ($client->errno || ($client->info['http_code'] ?? 0) !== 200 || !is_array($result) ||
                !isset($result['outcome']) || !in_array($result['outcome'], [11, 12, 13, 15, 17, 19, 30, 31], true) ||
                !is_string($result['stdout'] ?? null) || !is_string($result['stderr'] ?? null)) {
            throw new \moodle_exception('gradingunavailable', 'qtype_vizcode');
        }
        return $result;
    }
}