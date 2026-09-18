<?php

$valid = ['id' => 1, 'nome' => ' Ana ', 'email' => 'ana@example.com', 'cidade' => ' São Paulo ', 'telefone' => '11987654321'];
return [
    $valid,
    $valid,
    array_replace($valid, ['id' => 2, 'email' => 'ANA@EXAMPLE.COM']),
    array_replace($valid, ['id' => 3, 'email' => 'inválido']),
    array_replace($valid, ['id' => 4, 'telefone' => '123']),
    null,
    ['id' => 5],
];
