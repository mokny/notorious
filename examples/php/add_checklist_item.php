<?php
/**
 * Notorious API - Add a checklist item example (PHP curl extension only).
 *
 * A checklist is a single block whose content holds ALL of its items
 * (`{"items": [{"id", "markdown", "checked"}, ...]}`) - items are not
 * separate blocks. PATCH /api/v1/blocks/:id shallow-merges the given
 * `content` into the existing one, so appending an item means sending the
 * full items array back with the new one added.
 *
 * Usage:
 *   php add_checklist_item.php "Buy milk"
 */

const API_URL = 'http://localhost:4000';
const API_TOKEN = 'ntr_your_api_token_here';
const OBJECT_ID = 'your-object-id';
const CHECKLIST_BLOCK_ID = 'your-checklist-block-id';

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

function uuidV4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}

function main(array $argv): void
{
    if (count($argv) !== 2) {
        fwrite(STDERR, "Usage: php {$argv[0]} <item text>\n");
        exit(1);
    }
    $itemText = $argv[1];

    $blocks = requestJson('GET', '/api/v1/objects/' . OBJECT_ID . '/blocks');

    $checklist = null;
    foreach ($blocks as $block) {
        if ($block['id'] === CHECKLIST_BLOCK_ID) {
            $checklist = $block;
            break;
        }
    }
    if ($checklist === null || $checklist['type'] !== 'checklist') {
        fwrite(STDERR, "CHECKLIST_BLOCK_ID does not point to a checklist block in OBJECT_ID.\n");
        exit(1);
    }

    $items = $checklist['content']['items'] ?? [];
    $items[] = ['id' => uuidV4(), 'markdown' => $itemText, 'checked' => false];

    requestJson('PATCH', '/api/v1/blocks/' . CHECKLIST_BLOCK_ID, [
        'content' => ['items' => $items],
    ]);

    echo "Added item: {$itemText}\n";
}

main($argv);
