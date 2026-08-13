<?php
/**
 * Notorious API - Full-text/fuzzy search example (PHP curl extension only).
 *
 * Usage:
 *   php search_example.php "search text"
 */

const API_URL = 'http://localhost:4000';
const API_TOKEN = 'ntr_your_api_token_here';
const WORKSPACE_ID = 'your-workspace-id';

function main(array $argv): void
{
    if (count($argv) !== 2) {
        fwrite(STDERR, "Usage: php {$argv[0]} <search text>\n");
        exit(1);
    }
    $query = $argv[1];

    $path = '/api/v1/workspaces/' . WORKSPACE_ID . '/search?' . http_build_query(['q' => $query]);
    $ch = curl_init(API_URL . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . API_TOKEN],
    ]);
    $responseBody = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($responseBody, true);
    if ($status >= 400) {
        fwrite(STDERR, "Request failed ({$status}): {$data['message']}\n");
        exit(1);
    }

    echo count($data) . " result(s) for '{$query}':\n";
    foreach ($data as $object) {
        echo "  - {$object['title']}  (id: {$object['id']})\n";
    }
}

main($argv);
