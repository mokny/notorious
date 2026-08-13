<?php
/**
 * Notorious API - Authentication example (PHP curl extension only).
 *
 * Sends a Bearer-token request to a protected endpoint to verify that an
 * API key works, and prints the workspaces the key's owner can see.
 *
 * Get an API key: web UI -> Settings -> API keys -> Create key.
 */

const API_URL = 'http://localhost:4000';
const API_TOKEN = 'ntr_your_api_token_here';

function main(): void
{
    $ch = curl_init(API_URL . '/api/v1/workspaces');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . API_TOKEN],
    ]);
    $responseBody = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($responseBody, true);

    if ($status >= 400) {
        echo "Authentication failed ({$status}): {$data['message']}\n";
        return;
    }

    echo 'Token is valid. Access to ' . count($data) . " workspace(s):\n";
    foreach ($data as $workspace) {
        echo "  - {$workspace['name']}  (id: {$workspace['id']})\n";
    }
}

main();
