<?php

declare(strict_types=1);

require_once __DIR__ . '/autoload.php';

use App\Repositories\CustomerRepository;
use Core\ServiceContainer;
use Core\HttpRouter;

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
date_default_timezone_set('America/Sao_Paulo');

$container = new ServiceContainer();
$container->singleton(
    CustomerRepository::class,
    static fn (): CustomerRepository => new CustomerRepository(BASE_PATH . '/data/clientes.php'),
);

$router = new HttpRouter($container);
(require BASE_PATH . '/routes/web.php')($router);

return $router;
