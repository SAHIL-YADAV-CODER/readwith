<?php
/**
 * SecureChat Server - Message Store/Relay (MySQL / PDO)
 *
 * Uses provided MySQL credentials. Stores only ciphertext (server cannot decrypt).
 * Endpoints:
 *  - POST ?action=send    -> store encrypted message (JSON body)
 *  - GET  ?action=fetch   -> fetch messages for chat_id
 *  - GET  ?action=health  -> health check
 *
 * Based on original uploaded server.php (keeps validation, limits, and fields).
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Restrict in production
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/* -----------------------------
   Database configuration
   -----------------------------
   Replace with environment/config file in production.
*/
$dbHost = 'sql207.infinityfree.com';
$dbName = 'if0_40614929_Kiss';
$dbUser = 'if0_40614929';
$dbPass = 'rduRkb3BFS';
$dbCharset = 'utf8mb4';

/* Directory for legacy file storage (if any) */
$dataDir = __DIR__ . '/data';
if (!file_exists($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

/* Optional API key check (RECOMMENDED)
   Uncomment and set YOUR_API_KEY to enforce a simple bearer token:
*/
//$REQUIRE_API_KEY = true;
//$EXPECTED_API_KEY = 'YOUR_API_KEY_HERE';

/* -----------------------------
   Helper: connect to MySQL via PDO and ensure table exists
   ----------------------------- */
function getDatabasePDO() {
    global $dbHost, $dbName, $dbUser, $dbPass, $dbCharset;

    $dsn = "mysql:host={$dbHost};dbname={$dbName};charset={$dbCharset}";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        $pdo = new PDO($dsn, $dbUser, $dbPass, $options);

        // Create table if not exists (roughly matches original SQLite schema)
        $createSQL = "
            CREATE TABLE IF NOT EXISTS messages (
              id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              chat_id VARCHAR(191) NOT NULL,
              sender VARCHAR(191) NOT NULL,
              ciphertext MEDIUMTEXT NOT NULL,
              iv VARCHAR(255) DEFAULT NULL,
              message_type VARCHAR(64) DEFAULT 'text',
              media_ciphertext MEDIUMTEXT DEFAULT NULL,
              media_iv VARCHAR(255) DEFAULT NULL,
              media_filename VARCHAR(255) DEFAULT NULL,
              created_at INT UNSIGNED NOT NULL,
              meta JSON DEFAULT NULL,
              INDEX idx_chat_created (chat_id, created_at),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ";
        $pdo->exec($createSQL);

        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'DB connection failed: '.$e->getMessage()]);
        exit();
    }
}

/* -----------------------------
   Basic auth check helper (optional)
   ----------------------------- */
function requireApiKeyIfNeeded() {
    // If you enable API key mode, use this to block unauthorized requests
    global $REQUIRE_API_KEY, $EXPECTED_API_KEY;
    if (!empty($REQUIRE_API_KEY)) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (stripos($auth, 'Bearer ') === 0) {
            $token = substr($auth, 7);
        } else {
            $token = '';
        }
        if ($token !== ($EXPECTED_API_KEY ?? '')) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Unauthorized']);
            exit();
        }
    }
}

/* -----------------------------
   Routing
   ----------------------------- */
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'send':
        requireApiKeyIfNeeded();
        handleSend();
        break;
    case 'fetch':
        requireApiKeyIfNeeded();
        handleFetch();
        break;
    case 'health':
        echo json_encode(['status' => 'ok', 'timestamp' => time()]);
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action. Use: send, fetch, or health']);
        break;
}

/* -----------------------------
   Handler: send
   - Expects JSON body with:
     { chat_id, ciphertext, iv, timestamp, sender, message_type?, media_ciphertext?, media_iv?, media_filename?, meta? }
   - Stores only ciphertext; server never has keys.
   ----------------------------- */
function handleSend() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        return;
    }

    $required = ['chat_id', 'ciphertext', 'iv', 'timestamp', 'sender'];
    foreach ($required as $field) {
        if (empty($data[$field]) && $data[$field] !== '0') {
            http_response_code(400);
            echo json_encode(['error' => "Missing required field: $field"]);
            return;
        }
    }

    // sanitize basic fields (same style as original script)
    $chatId = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $data['chat_id']), 0, 100);
    $ciphertext = $data['ciphertext'];
    $iv = $data['iv'];
    $timestamp = intval($data['timestamp']);
    $sender = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $data['sender']), 0, 50);
    $messageType = $data['message_type'] ?? 'text';
    $mediaCiphertext = $data['media_ciphertext'] ?? null;
    $mediaIv = $data['media_iv'] ?? null;
    $mediaFilename = isset($data['media_filename']) ? substr($data['media_filename'], 0, 255) : null;
    $meta = isset($data['meta']) ? json_encode($data['meta']) : null;

    // size limits similar to original
    $maxSize = 15 * 1024 * 1024; // 15 MB

    if (strlen($ciphertext) > $maxSize) {
        http_response_code(400);
        echo json_encode(['error' => 'Message too large']);
        return;
    }
    if ($mediaCiphertext && strlen($mediaCiphertext) > $maxSize) {
        http_response_code(400);
        echo json_encode(['error' => 'Media too large']);
        return;
    }

    try {
        $pdo = getDatabasePDO();
        $sql = "INSERT INTO messages
            (chat_id, sender, ciphertext, iv, message_type, media_ciphertext, media_iv, media_filename, created_at, meta)
            VALUES (:chat_id, :sender, :ciphertext, :iv, :message_type, :media_ciphertext, :media_iv, :media_filename, :created_at, :meta)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':chat_id' => $chatId,
            ':sender' => $sender,
            ':ciphertext' => $ciphertext,
            ':iv' => $iv,
            ':message_type' => $messageType,
            ':media_ciphertext' => $mediaCiphertext,
            ':media_iv' => $mediaIv,
            ':media_filename' => $mediaFilename,
            ':created_at' => $timestamp > 0 ? $timestamp : time(),
            ':meta' => $meta
        ]);

        $insertId = $pdo->lastInsertId();
        echo json_encode([
            'success' => true,
            'message_id' => $insertId,
            'note' => 'Message stored as ciphertext only - server cannot decrypt'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to store message', 'detail' => $e->getMessage()]);
    }
}

/* -----------------------------
   Handler: fetch
   - Query params: chat_id (required), since (optional unix ts), limit (optional)
   - Returns messages ordered ascending by created_at (timestamp)
   ----------------------------- */
function handleFetch() {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $chatIdRaw = $_GET['chat_id'] ?? '';
    if (empty($chatIdRaw)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing chat_id parameter']);
        return;
    }

    $chatId = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $chatIdRaw), 0, 100);
    $since = isset($_GET['since']) ? intval($_GET['since']) : 0;
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 500;
    if ($limit <= 0 || $limit > 2000) $limit = 500; // reasonable cap

    try {
        $pdo = getDatabasePDO();

        if ($since > 0) {
            $sql = "SELECT id, chat_id, sender, ciphertext, iv, message_type, media_ciphertext, media_iv, media_filename, created_at, meta
                    FROM messages
                    WHERE chat_id = :chat_id AND created_at > :since
                    ORDER BY created_at ASC
                    LIMIT :limit";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':chat_id', $chatId, PDO::PARAM_STR);
            $stmt->bindValue(':since', $since, PDO::PARAM_INT);
            $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
            $stmt->execute();
        } else {
            $sql = "SELECT id, chat_id, sender, ciphertext, iv, message_type, media_ciphertext, media_iv, media_filename, created_at, meta
                    FROM messages
                    WHERE chat_id = :chat_id
                    ORDER BY created_at ASC
                    LIMIT :limit";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':chat_id', $chatId, PDO::PARAM_STR);
            $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
            $stmt->execute();
        }

        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'chat_id' => $chatId,
            'messages' => $messages,
            'count' => count($messages),
            'note' => 'All messages are encrypted - server cannot read content'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to fetch messages', 'detail' => $e->getMessage()]);
    }
}
