<?php
/**
 * SecureChat Server - Message Store/Relay with Media Support
 * 
 * SECURITY NOTE: This server is a "dumb" relay. It:
 * - Stores ONLY encrypted ciphertext (cannot decrypt messages or media)
 * - Never receives plaintext passwords or encryption keys
 * - Uses SQLite for persistent storage
 * 
 * Endpoints:
 * - POST ?action=send : Store encrypted message (with optional media)
 * - GET  ?action=fetch&chat_id=... : Retrieve encrypted messages
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dbPath = __DIR__ . '/data/messages.db';
$dataDir = __DIR__ . '/data';

if (!file_exists($dataDir)) {
    mkdir($dataDir, 0755, true);
}

function getDatabase($dbPath) {
    try {
        $db = new PDO('sqlite:' . $dbPath);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $db->exec('CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            sender TEXT NOT NULL,
            message_type TEXT DEFAULT "text",
            media_ciphertext TEXT,
            media_iv TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )');
        
        $db->exec('CREATE INDEX IF NOT EXISTS idx_chat_id ON messages(chat_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)');
        
        return $db;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed']);
        exit();
    }
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'send':
        handleSend($dbPath);
        break;
    case 'fetch':
        handleFetch($dbPath);
        break;
    case 'health':
        echo json_encode(['status' => 'ok', 'timestamp' => time()]);
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action. Use: send, fetch, or health']);
        break;
}

/**
 * Handle sending encrypted messages with optional media
 * Expects JSON: { chat_id, ciphertext, iv, timestamp, sender, message_type, media_ciphertext?, media_iv? }
 */
function handleSend($dbPath) {
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
        if (empty($data[$field])) {
            http_response_code(400);
            echo json_encode(['error' => "Missing required field: $field"]);
            return;
        }
    }
    
    $chatId = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $data['chat_id']), 0, 100);
    $ciphertext = $data['ciphertext'];
    $iv = $data['iv'];
    $timestamp = intval($data['timestamp']);
    $sender = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $data['sender']), 0, 50);
    $messageType = $data['message_type'] ?? 'text';
    $mediaCiphertext = $data['media_ciphertext'] ?? null;
    $mediaIv = $data['media_iv'] ?? null;
    
    $maxSize = 15 * 1024 * 1024;
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
        $db = getDatabase($dbPath);
        $stmt = $db->prepare('INSERT INTO messages (chat_id, ciphertext, iv, timestamp, sender, message_type, media_ciphertext, media_iv) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$chatId, $ciphertext, $iv, $timestamp, $sender, $messageType, $mediaCiphertext, $mediaIv]);
        
        echo json_encode([
            'success' => true,
            'message_id' => $db->lastInsertId(),
            'note' => 'Message stored as ciphertext only - server cannot decrypt'
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to store message']);
    }
}

/**
 * Handle fetching encrypted messages with media
 * Returns all encrypted messages for a chat_id
 */
function handleFetch($dbPath) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    
    $chatId = $_GET['chat_id'] ?? '';
    if (empty($chatId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing chat_id parameter']);
        return;
    }
    
    $chatId = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $chatId), 0, 100);
    $since = isset($_GET['since']) ? intval($_GET['since']) : 0;
    
    try {
        $db = getDatabase($dbPath);
        
        if ($since > 0) {
            $stmt = $db->prepare('SELECT id, ciphertext, iv, timestamp, sender, message_type, media_ciphertext, media_iv FROM messages WHERE chat_id = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT 500');
            $stmt->execute([$chatId, $since]);
        } else {
            $stmt = $db->prepare('SELECT id, ciphertext, iv, timestamp, sender, message_type, media_ciphertext, media_iv FROM messages WHERE chat_id = ? ORDER BY timestamp ASC LIMIT 500');
            $stmt->execute([$chatId]);
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
        echo json_encode(['error' => 'Failed to fetch messages']);
    }
}
?>
