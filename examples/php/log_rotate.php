<?php
/**
 * Notorious API - Log rotation example (PHP curl extension only).
 *
 * Appends a new paragraph block at the bottom of an object, and - if that
 * pushes the block count above MAX_LINES - deletes the oldest (topmost)
 * block. Treats every block in the target object as one log line, so
 * point OBJECT_ID at an object you use only for this log.
 *
 * Usage:
 *   php log_rotate.php "some log line"
 */

const API_URL = 'http://localhost:4000';
const API_TOKEN = 'ntr_your_api_token_here';
const OBJECT_ID = 'your-object-id';
const MAX_LINES = 20;

function requestJson(string $method, string $path, ?array $body = null): mixed
{
    $ch = curl_init(API_URL . $path);
    $headers = ['Authorization: Bearer ' . API_TOKEN, 'Content-Type: application/json'];
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($body !== null) {
        $options[CURLOPT_POSTFIELDS] = json_encode($body);
    }
    curl_setopt_array($ch, $options);
    $responseBody = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status >= 400) {
        $data = json_decode($responseBody, true);
        fwrite(STDERR, "Request failed ({$status}): {$data['message']}\n");
        exit(1);
    }
    return $status === 204 ? null : json_decode($responseBody, true);
}

function main(array $argv): void
{
    if (count($argv) !== 2) {
        fwrite(STDERR, "Usage: php {$argv[0]} <log line>\n");
        exit(1);
    }
    $line = $argv[1];

    $blocks = requestJson('GET', '/api/v1/objects/' . OBJECT_ID . '/blocks');
    $lastBlockId = count($blocks) > 0 ? $blocks[count($blocks) - 1]['id'] : null;

    requestJson('POST', '/api/v1/blocks', [
        'objectId' => OBJECT_ID,
        'type' => 'paragraph',
        'content' => ['markdown' => $line],
        'afterBlockId' => $lastBlockId,
    ]);
    echo "Appended: {$line}\n";

    $excess = max(0, (count($blocks) + 1) - MAX_LINES);
    for ($i = 0; $i < $excess; $i++) {
        requestJson('DELETE', '/api/v1/blocks/' . $blocks[$i]['id']);
        echo 'Removed oldest line to stay under ' . MAX_LINES . ".\n";
    }
}

main($argv);
