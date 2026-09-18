<?php

declare(strict_types=1);

use App\Controllers\CustomerController;
use Core\Request;
use Core\Response;
use Core\HttpRouter;

return static function (HttpRouter $router): void {
    $router->get('/', static function (Request $request): Response {
        return Response::make((string)file_get_contents(BASE_PATH . '/src/Views/relatorio.html'));
    });

    $router->get('/api/customers', [CustomerController::class, 'index']);
};
