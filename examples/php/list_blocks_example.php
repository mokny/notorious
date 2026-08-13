<?php
/**
 * Notorious API - List an object's blocks example (PHP curl extension only).
 *
 * Fetches an object and its content blocks, and prints a readable outline.
 * Blocks come back in one flat, position-ordered array (no pagination).
 */

const API_URL = 'http://localhost:4000';
const API_TOKEN = 'ntr_your_api_token_here';
const OBJECT_ID = 'your-object-id';

function requestJson(string $path): mixed
{
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
    return $data;
}

function main(): void
{
    $object = requestJson('/api/v1/objects/' . OBJECT_ID);
    $blocks = requestJson('/api/v1/objects/' . OBJECT_ID . '/blocks');

    echo "{$object['title']}  (" . count($blocks) . " block(s))\n\n";
    foreach ($blocks as $block) {
        $text = $block['content']['markdown'] ?? json_encode($block['content']);
        echo "[{$block['type']}] {$text}\n";
    }
}

main();
