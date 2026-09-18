<?php

declare(strict_types=1);

namespace Core;

use ReflectionClass;
use ReflectionNamedType;
use ReflectionParameter;
use Core\Exceptions\DependencyResolutionException;
use Core\Exceptions\CircularDependencyException;
use ReflectionException;

class ServiceContainer
{
    private array $bindings = [];
    private array $instances = [];
    private array $singletons = [];
    private array $resolving = [];

    public function get(string $class): object
    {
        if (isset($this->resolving[$class])) {
            throw new CircularDependencyException('Dependência circular: ' . implode(' -> ', [...array_keys($this->resolving), $class]));
        }

        $this->resolving[$class] = true;
        try {
            return $this->build($class);
        } finally {
            unset($this->resolving[$class]);
        }
    }

    private function build(string $class): object
    {
        if (isset($this->instances[$class])) {
            return $this->instances[$class];
        }

        if (isset($this->bindings[$class])) {
            $object = ($this->bindings[$class])();
            if (!$object instanceof $class) {
                throw new DependencyResolutionException("A fábrica de {$class} retornou um tipo incompatível.");
            }
            if (isset($this->singletons[$class])) {
                $this->instances[$class] = $object;
            }

            return $object;
        }

        try {
            $reflector = new ReflectionClass($class);
        } catch (ReflectionException $exception) {
            throw new DependencyResolutionException("Classe não encontrada: {$class}.", 0, $exception);
        }
        if (!$reflector->isInstantiable()) {
            throw new DependencyResolutionException("Registre uma fábrica para {$class}.");
        }
        $constructor = $reflector->getConstructor();
        if ($constructor === null) {
            return new $class();
        }

        $parameters = [];
        foreach ($constructor->getParameters() as $parameter) {
            $parameters[] = $this->resolve($parameter, $class);
        }

        return $reflector->newInstanceArgs($parameters);
    }

    public function singleton(string $class, callable $factory): void
    {
        unset($this->instances[$class]);
        $this->bindings[$class] = $factory;
        $this->singletons[$class] = true;
    }

    private function resolve(ReflectionParameter $parameter, string $class): mixed
    {
        $type = $parameter->getType();
        if ($type instanceof ReflectionNamedType && !$type->isBuiltin()) {
            return $this->get($type->getName());
        }

        if ($parameter->isDefaultValueAvailable()) {
            return $parameter->getDefaultValue();
        }

        throw new DependencyResolutionException("Não foi possível resolver {$parameter->getName()} em {$class}.");
    }
}
