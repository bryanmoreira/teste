<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

$composerAutoload = BASE_PATH . '/vendor/autoload.php';
if (is_file($composerAutoload)) {
    require_once $composerAutoload;
}

if (!class_exists('Core\\ServiceContainer')) {
    spl_autoload_register(static function (string $class): void {
        $prefixes = [
            'Core\\' => BASE_PATH . '/core/',
            'App\\' => BASE_PATH . '/src/',
        ];

        foreach ($prefixes as $prefix => $directory) {
            if (!str_starts_with($class, $prefix)) {
                continue;
            }

            $relativeClass = substr($class, strlen($prefix));
            $path = $directory . str_replace('\\', '/', $relativeClass) . '.php';
            if (is_file($path)) {
                require_once $path;
            }

            return;
        }
    });
}
