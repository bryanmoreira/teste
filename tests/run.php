<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap/autoload.php';

use App\Exceptions\CustomerDataException;
use Core\Exceptions\DependencyResolutionException;
use Core\Exceptions\CircularDependencyException;

$passed = 0;
$failed = 0;

function test(string $description, callable $test): void
{
    global $passed, $failed;

    try {
        $test();
        ++$passed;
        echo "OK  {$description}\n";
    } catch (Throwable $exception) {
        ++$failed;
        echo "FALHA  {$description}: {$exception->getMessage()}\n";
    }
}

function expectSame(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        $detail = $message !== '' ? " ({$message})" : '';
        throw new RuntimeException(
            'esperado ' . var_export($expected, true)
            . ', recebido ' . var_export($actual, true) . $detail
        );
    }
}

function expectTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expectThrows(string $type, callable $operation): Throwable
{
    try {
        $operation();
    } catch (Throwable $exception) {
        expectTrue($exception instanceof $type, 'Tipo inesperado: ' . $exception::class);
        return $exception;
    }
    throw new LogicException("Exceção esperada: {$type}");
}

function startTestServer(string $documentRoot): array
{
    $port = random_int(18000, 18999);
    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open(
        [PHP_BINARY, '-S', "127.0.0.1:{$port}", '-t', $documentRoot, $documentRoot . '/index.php'],
        $descriptorSpec,
        $pipes,
        $documentRoot,
        null,
        ['bypass_shell' => true]
    );

    if (!is_resource($process)) {
        throw new RuntimeException('não foi possível iniciar o servidor PHP de teste');
    }

    $ready = false;
    $deadline = microtime(true) + 5;
    while (microtime(true) < $deadline) {
        $socket = @fsockopen('127.0.0.1', $port, $errorNumber, $errorMessage, 0.2);
        if (is_resource($socket)) {
            fclose($socket);
            $ready = true;
            break;
        }
        usleep(50_000);
    }

    foreach ($pipes as $pipe) {
        stream_set_blocking($pipe, false);
    }

    if (!$ready) {
        proc_terminate($process);
        proc_close($process);
        throw new RuntimeException('o servidor PHP de teste não ficou disponível');
    }

    return ['process' => $process, 'port' => $port];
}

function request(int $port, string $path, string $method = 'GET'): array
{
    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => "Accept: application/json\r\n",
            'ignore_errors' => true,
            'timeout' => 3,
        ],
    ]);
    $body = @file_get_contents("http://127.0.0.1:{$port}{$path}", false, $context);
    $headers = $http_response_header ?? [];
    $status = 0;
    if (isset($headers[0]) && preg_match('/\s(\d{3})\s/', $headers[0], $matches)) {
        $status = (int)$matches[1];
    }

    return [
        'status' => $status,
        'headers' => $headers,
        'body' => $body === false ? '' : $body,
        'json' => $body === false || $body === '' ? null : json_decode($body, true),
    ];
}

test('o repositório retorna os clientes válidos', function (): void {
    $repository = new \App\Repositories\CustomerRepository(BASE_PATH . '/data/clientes.php');
    $customers = $repository->all();

    expectSame(47, count($customers));
    expectSame('Ana Pereira', $customers[0]['nome'] ?? null);
});

test('o container resolve o controlador e sua dependência', function (): void {
    $container = new \Core\ServiceContainer();
    $container->singleton(
        \App\Repositories\CustomerRepository::class,
        static fn (): \App\Repositories\CustomerRepository => new \App\Repositories\CustomerRepository(BASE_PATH . '/data/clientes.php'),
    );

    expectTrue($container->get(\App\Controllers\CustomerController::class) instanceof \App\Controllers\CustomerController, 'controlador não resolvido');
});

$server = null;
class CircularDependency
{
    public function __construct(public CircularDependency $dependency)
    {
    }
}

test('dependências circulares falham com diagnóstico e liberam o estado', function (): void {
    $services = new \Core\ServiceContainer();
    for ($attempt = 0; $attempt < 2; ++$attempt) {
        try {
            $services->get(CircularDependency::class);
            throw new LogicException('o ciclo deveria ser rejeitado');
        } catch (CircularDependencyException $exception) {
            expectTrue(str_contains($exception->getMessage(), 'Dependência circular:'), 'diagnóstico ausente');
        }
    }
    expectTrue($services->get(\App\Services\CustomerSearch::class) instanceof \App\Services\CustomerSearch, 'estado não recuperado');
});

test('singleton reutiliza instância e rejeita fábrica incompatível', function (): void {
    $services = new \Core\ServiceContainer();
    $services->singleton(\stdClass::class, fn () => new \stdClass());
    expectTrue($services->get(\stdClass::class) === $services->get(\stdClass::class), 'singleton não reutilizado');
    $services->singleton(\stdClass::class, fn () => new \ArrayObject());
    try {
        $services->get(\stdClass::class);
        throw new LogicException('fábrica inválida deveria falhar');
    } catch (DependencyResolutionException $exception) {
        expectTrue(str_contains($exception->getMessage(), 'tipo incompatível'), 'erro de fábrica ausente');
    }
});

test('router constrói resposta 405 sem enviar cabeçalhos e respeita prefixo da API', function (): void {
    $router = new \Core\HttpRouter(new \Core\ServiceContainer());
    $router->get('/api/example', fn () => \Core\Response::json([]));
    $response = $router->dispatch(new \Core\Request('POST', '/api/example', []));
    expectSame(405, $response->status());
    expectSame('GET', $response->headers()['Allow']);
    expectSame(false, $router->expectsJson('/apiary'));
    expectSame(true, $router->expectsJson('/api/example'));
});

test('busca combina nome e cidade sem depender de acentos ou caixa', function (): void {
    $repository = new \App\Repositories\CustomerRepository(BASE_PATH . '/data/clientes.php');
    $search = new \App\Services\CustomerSearch();
    $result = $search->filter($repository->all(), '  SAO   ANA  ');
    expectSame([1], array_column($result, 'id'));
    expectSame([1], array_column($search->filter($repository->all(), '11987'), 'id'));
    expectSame([1], array_column($search->filter($repository->all(), '(11) 98765-4321'), 'id'));
    expectSame([], $search->filter($repository->all(), 'cidade inexistente'));
});

test('saída indevida da fonte não contamina a resposta', function (): void {
    $repository = new \App\Repositories\CustomerRepository(__DIR__ . '/fixtures/noisy.php');
    ob_start();
    try {
        try {
            $repository->all();
            throw new LogicException('a fonte deveria ser rejeitada');
        } catch (CustomerDataException $exception) {
            expectSame('A fonte de dados produziu saída inesperada.', $exception->getMessage());
        }
        expectSame('', ob_get_contents());
    } finally {
        ob_end_clean();
    }
});

test('fonte vazia retorna uma lista vazia', function (): void {
    expectSame([], (new \App\Repositories\CustomerRepository(__DIR__ . '/fixtures/empty.php'))->all());
});

test('fonte ausente e formato inválido usam exceção de dados', function (): void {
    foreach (['missing.php', 'invalid-source.php'] as $file) {
        expectThrows(CustomerDataException::class, fn () => (new \App\Repositories\CustomerRepository(__DIR__ . '/fixtures/' . $file))->all());
    }
});

test('falha de leitura preserva a causa original e restaura o buffer', function (): void {
    $level = ob_get_level();
    $exception = expectThrows(CustomerDataException::class, fn () => (new \App\Repositories\CustomerRepository(__DIR__ . '/fixtures/failing-source.php'))->all());
    expectTrue($exception->getPrevious() instanceof LogicException, 'causa original perdida');
    expectSame($level, ob_get_level());
});

test('normalização descarta duplicados e inválidos e remove espaços', function (): void {
    $rows = (new \App\Repositories\CustomerRepository(__DIR__ . '/fixtures/mixed-customers.php'))->all();
    expectSame(1, count($rows));
    expectSame('Ana', $rows[0]['nome']);
    expectSame('São Paulo', $rows[0]['cidade']);
});

test('classe inexistente preserva erro de reflexão como causa', function (): void {
    $exception = expectThrows(DependencyResolutionException::class, fn () => (new \Core\ServiceContainer())->get('MissingServiceForTest'));
    expectTrue($exception->getPrevious() instanceof ReflectionException, 'causa de reflexão perdida');
});

test('interface sem fábrica e parâmetro escalar obrigatório são rejeitados', function (): void {
    $services = new \Core\ServiceContainer();
    expectThrows(DependencyResolutionException::class, fn () => $services->get(\Countable::class));
    expectThrows(DependencyResolutionException::class, fn () => $services->get(\App\Repositories\CustomerRepository::class));
});

test('adicionar cabeçalho não altera a resposta original', function (): void {
    $original = \Core\Response::json([]);
    $modified = $original->withHeader('Allow', 'GET');
    expectSame(false, isset($original->headers()['Allow']));
    expectSame('GET', $modified->headers()['Allow']);
});

try {
    $server = startTestServer(dirname(__DIR__) . '/public');

    test('GET na raiz retorna a interface', function () use ($server): void {
        $response = request($server['port'], '/');
        expectSame(200, $response['status']);
        expectTrue(str_contains($response['body'], 'Relatório de clientes'), 'interface não encontrada');
    });

    test('GET customers retorna clientes e filtra por cidade', function () use ($server): void {
        $response = request($server['port'], '/api/customers?busca=Campinas');
        expectSame(200, $response['status']);
        expectSame(2, count($response['json'] ?? []));
        expectSame('Campinas', $response['json'][0]['cidade'] ?? null);
        expectSame('Campinas', $response['json'][1]['cidade'] ?? null);
    });

    test('customers rejeita métodos diferentes de GET', function () use ($server): void {
        $response = request($server['port'], '/api/customers', 'POST');
        expectSame(405, $response['status']);
        expectSame('Método não permitido.', $response['json']['erro'] ?? null);
        expectTrue(in_array('Allow: GET', $response['headers'], true), 'header Allow ausente');
    });

    test('API aceita busca sem acentos e parâmetros em formato inesperado', function () use ($server): void {
        $response = request($server['port'], '/api/customers?busca=SAO%20ANA');
        expectSame(200, $response['status']);
        expectSame([1], array_column($response['json'], 'id'));
        $response = request($server['port'], '/api/customers?busca[]=x');
        expectSame(200, $response['status']);
        expectSame(47, count($response['json']));
    });

    test('rota de API inexistente retorna JSON 404', function () use ($server): void {
        $response = request($server['port'], '/api/not-found');
        expectSame(404, $response['status']);
        expectSame('Rota não encontrada.', $response['json']['erro'] ?? null);
    });
} catch (Throwable $exception) {
    ++$failed;
    echo "FALHA  inicialização do servidor de teste: {$exception->getMessage()}\n";
} finally {
    if (is_array($server) && is_resource($server['process'])) {
        proc_terminate($server['process']);
        proc_close($server['process']);
    }
}

echo "\n{$passed} testes aprovados; {$failed} falhas.\n";
exit($failed === 0 ? 0 : 1);
