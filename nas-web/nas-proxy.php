<?php
$config = require __DIR__ . '/nas-proxy.config.php';
$mode = isset($_GET['_lfx_mode']) ? $_GET['_lfx_mode'] : '';
$targetPath = isset($_GET['_lfx_path']) ? $_GET['_lfx_path'] : '';

if (!isset($config[$mode])) {
    sendJsonError(400, 'Unknown NAS proxy mode.');
}

if ($targetPath === '' || preg_match('/[\x00-\x1F\x7F]/', $targetPath)) {
    sendJsonError(400, 'Invalid NAS proxy path.');
}

if (!function_exists('curl_init')) {
    sendJsonError(500, 'PHP cURL extension is required.');
}

unset($_GET['_lfx_mode'], $_GET['_lfx_path']);

$targetConfig = $config[$mode];
$baseUrl = rtrim($targetConfig['base_url'], '/') . '/';
$targetUrl = $baseUrl . ltrim($targetPath, '/');
$query = http_build_query($_GET);

if ($query !== '') {
    $targetUrl .= '?' . $query;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$curl = curl_init($targetUrl);

curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
curl_setopt($curl, CURLOPT_HEADER, false);
curl_setopt($curl, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, !empty($targetConfig['verify_tls']));
curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, !empty($targetConfig['verify_tls']) ? 2 : 0);
curl_setopt($curl, CURLOPT_HTTPHEADER, getForwardHeaders(isMultipartRequest()));

if ($method !== 'GET' && $method !== 'HEAD') {
    curl_setopt($curl, CURLOPT_POSTFIELDS, getRequestBody());
}

$responseBody = curl_exec($curl);

if ($responseBody === false) {
    $message = curl_error($curl);
    curl_close($curl);
    sendJsonError(502, 'NAS proxy request failed: ' . $message);
}

$statusCode = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
curl_close($curl);

http_response_code($statusCode > 0 ? $statusCode : 200);

if ($contentType) {
    header('Content-Type: ' . $contentType);
}

echo $responseBody;

function getForwardHeaders($isMultipart)
{
    $headers = array();

    foreach (getRequestHeaders() as $name => $value) {
        $lowerName = strtolower($name);

        if (in_array($lowerName, array('host', 'origin', 'referer', 'content-length', 'accept-encoding'), true)) {
            continue;
        }

        if ($isMultipart && $lowerName === 'content-type') {
            continue;
        }

        $headers[] = $name . ': ' . $value;
    }

    return $headers;
}

function getRequestHeaders()
{
    if (function_exists('getallheaders')) {
        $headers = getallheaders();

        return is_array($headers) ? $headers : array();
    }

    $headers = array();

    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') !== 0) {
            continue;
        }

        $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
        $headers[$name] = $value;
    }

    return $headers;
}

function getRequestBody()
{
    if (!isMultipartRequest()) {
        return file_get_contents('php://input');
    }

    $fields = $_POST;

    foreach ($_FILES as $name => $file) {
        if (is_array($file['tmp_name'])) {
            foreach ($file['tmp_name'] as $index => $tmpName) {
                if (!is_uploaded_file($tmpName)) {
                    continue;
                }

                $fieldName = $name . '[' . $index . ']';
                $fields[$fieldName] = new CURLFile($tmpName, $file['type'][$index], $file['name'][$index]);
            }

            continue;
        }

        if (is_uploaded_file($file['tmp_name'])) {
            $fields[$name] = new CURLFile($file['tmp_name'], $file['type'], $file['name']);
        }
    }

    return $fields;
}

function isMultipartRequest()
{
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? strtolower($_SERVER['CONTENT_TYPE']) : '';

    return strpos($contentType, 'multipart/form-data') !== false;
}

function sendJsonError($statusCode, $message)
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'success' => false,
        'error' => array(
            'code' => $statusCode,
            'message' => $message,
        ),
    ));
    exit;
}
