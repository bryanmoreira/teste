<?php

declare(strict_types=1);

namespace App\Services;

final class CustomerSearch
{
    public function filter(array $customers, string $query): array
    {
        $terms = preg_split('/\s+/u', $this->normalize(trim($query)), -1, PREG_SPLIT_NO_EMPTY);
        if (!$terms) {
            return array_values($customers);
        }

        return array_values(array_filter($customers, function (array $customer) use ($terms): bool {
            $text = $this->normalize("{$customer['nome']} {$customer['email']} {$customer['cidade']} {$customer['telefone']}");
            foreach ($terms as $term) {
                if (!str_contains($text, $term)) {
                    return false;
                }
            }
            return true;
        }));
    }

    private function normalize(string $text): string
    {
        $withoutAccents = strtolower(strtr($text, [
            'Á' => 'a', 'À' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a',
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a',
            'É' => 'e', 'È' => 'e', 'Ê' => 'e', 'Ë' => 'e',
            'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
            'Í' => 'i', 'Ì' => 'i', 'Î' => 'i', 'Ï' => 'i',
            'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
            'Ó' => 'o', 'Ò' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ö' => 'o',
            'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
            'Ú' => 'u', 'Ù' => 'u', 'Û' => 'u', 'Ü' => 'u',
            'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
            'Ç' => 'c', 'ç' => 'c', 'Ñ' => 'n', 'ñ' => 'n',
        ]));

        return preg_replace('/[^\p{L}\p{N}]+/u', ' ', $withoutAccents) ?? $withoutAccents;
    }
}
