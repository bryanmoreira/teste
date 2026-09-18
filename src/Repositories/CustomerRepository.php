<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Exceptions\CustomerDataException;
use Throwable;

class CustomerRepository
{
    public function __construct(private string $path)
    {
    }

    public function all(): array
    {
        if (!is_file($this->path) || !is_readable($this->path)) {
            throw new CustomerDataException('Fonte de dados inacessível.');
        }

        ob_start();
        try {
            $rows = require $this->path;
            $output = ob_get_contents();
        } catch (Throwable $exception) {
            throw new CustomerDataException('Falha ao interpretar a fonte de dados.', 0, $exception);
        } finally {
            ob_end_clean();
        }

        if ($output !== '') {
            throw new CustomerDataException('A fonte de dados produziu saída inesperada.');
        }

        if (!is_array($rows) || !array_is_list($rows)) {
            throw new CustomerDataException('Fonte de dados inválida.');
        }

        $customers = [];
        $ids = [];
        $emails = [];

        foreach ($rows as $row) {
            if (!is_array($row) || !isset($row['id'], $row['nome'], $row['email'], $row['cidade'], $row['telefone'])) {
                continue;
            }

            if (!is_int($row['id']) || $row['id'] <= 0
                || !is_string($row['nome']) || !is_string($row['email'])
                || !is_string($row['cidade']) || !is_string($row['telefone'])) {
                continue;
            }

            $name = trim($row['nome']);
            $email = trim($row['email']);
            $city = trim($row['cidade']);
            $phone = trim($row['telefone']);
            $emailKey = strtolower($email);

            if ($name === '' || $city === ''
                || !preg_match('//u', $name) || !preg_match('//u', $city)
                || !preg_match('//u', $email) || !preg_match('//u', $phone)
                || !filter_var($email, FILTER_VALIDATE_EMAIL)
                || !preg_match('/^\d{10,11}$/D', $phone)
                || isset($ids[$row['id']]) || isset($emails[$emailKey])) {
                continue;
            }

            $ids[$row['id']] = true;
            $emails[$emailKey] = true;
            $customers[] = [
                'id' => $row['id'],
                'nome' => $name,
                'email' => $email,
                'cidade' => $city,
                'telefone' => $phone,
            ];
        }

        return $customers;
    }
}
