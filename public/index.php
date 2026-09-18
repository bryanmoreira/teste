<?php

declare(strict_types=1);

use Core\Request;
use Core\Response;

$router = require __DIR__ . '/../bootstrap/app.php';
$request = Request::capture();

if (PHP_SAPI === 'cli-server' && is_file(__DIR__ . $request->path())) {
    return false;
}

try {
    $response = $router->dispatch($request);
} catch (Throwable $exception) {
    error_log((string)$exception);
    $response = $router->expectsJson($request->path())
        ? Response::json(['erro' => 'Erro interno ao processar a requisição.'], 500)
        : Response::make('Erro interno ao processar a requisição.', 500, 'text/plain; charset=utf-8');
}

$response->send();
