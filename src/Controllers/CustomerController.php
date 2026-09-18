<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Repositories\CustomerRepository;
use App\Services\CustomerSearch;
use Core\Request;
use Core\Response;

class CustomerController
{
    public function __construct(private CustomerRepository $repository, private CustomerSearch $search)
    {
    }

    public function index(Request $request): Response
    {
        return Response::json($this->search->filter($this->repository->all(), $request->query('busca')));
    }
}
