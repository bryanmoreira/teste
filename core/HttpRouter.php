<?php

declare(strict_types=1);

namespace Core;

class HttpRouter
{
    private const JSON_PREFIX = '/api';

    private array $routes = [];

    public function __construct(private ServiceContainer $container)
    {
    }

    public function get(string $path, callable|array $handler): void
    {
        $this->routes['GET'][$path] = $handler;
    }

    public function dispatch(Request $request): Response
    {
        $path = $request->path();
        $handler = $this->routes[$request->method()][$path] ?? null;
        if ($handler !== null) {
            return $this->run($handler, $request);
        }

        $allowed = $this->methodsFor($path);
        if ($allowed !== []) {
            return $this->fail($path, 'Método não permitido.', 405)
                ->withHeader('Allow', implode(', ', $allowed));
        }

        return $this->fail($path, 'Rota não encontrada.', 404);
    }

    public function expectsJson(string $path): bool
    {
        return $path === self::JSON_PREFIX || str_starts_with($path, self::JSON_PREFIX . '/');
    }

    private function run(callable|array $handler, Request $request): Response
    {
        if (is_array($handler)) {
            [$class, $action] = $handler;
            return $this->container->get($class)->$action($request);
        }

        return $handler($request);
    }

    private function fail(string $path, string $message, int $status): Response
    {
        return $this->expectsJson($path)
            ? Response::json(['erro' => $message], $status)
            : Response::make($message, $status, 'text/plain; charset=utf-8');
    }

    private function methodsFor(string $path): array
    {
        $methods = [];
        foreach ($this->routes as $method => $paths) {
            if (isset($paths[$path])) {
                $methods[] = $method;
            }
        }

        return $methods;
    }
}
