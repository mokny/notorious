<?php
/**
 * Notorious API - Create an object example (PHP curl extension only).
 *
 * Creating an object requires the target object type's id (not a plain
 * string like "note" - every workspace has its own row per system type).
 * This script first looks up the "note" type in the workspace, then
 * creates a new object of that type.
 */

const API_URL = 'http://localhost:4000';
const API_TOKEN = 'ntr_your_api_token_here';
const WORKSPACE_ID = 'your-workspace-id';

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

    $data = json_decode($responseBody, true);
    if ($status >= 400) {
        fwrite(STDERR, "Request failed ({$status}): {$data['message']}\n");
        exit(1);
    }
    return $data;
}

function main(): void
{
    $objectTypes = requestJson('GET', '/api/v1/workspaces/' . WORKSPACE_ID . '/object-types');

    $noteType = null;
    foreach ($objectTypes as $type) {
        if ($type['key'] === 'note') {
            $noteType = $type;
            break;
        }
    }
    if ($noteType === null) {
        fwrite(STDERR, "No 'note' object type found in this workspace.\n");
        exit(1);
    }

    $created = requestJson('POST', '/api/v1/workspaces/' . WORKSPACE_ID . '/objects', [
        'objectTypeId' => $noteType['id'],
        'title' => 'Created via the API',
    ]);

    echo "Created object '{$created['title']}' (id: {$created['id']})\n";
}

main();
