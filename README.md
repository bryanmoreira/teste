# Relatório de clientes

Aplicação em PHP, HTML, CSS e JavaScript, sem banco de dados. Requer PHP 8.1 ou superior e Composer.

Vídeo de demonstração: [assistir no YouTube](https://youtu.be/qOULRdajxuA)

## Executar

Na pasta do projeto, execute:

```sh
composer install
php -S localhost:8000 -t public public/index.php
```

Abra `http://localhost:8000/` no navegador. A interface consome `GET /api/customers?busca=<termo>`, que retorna uma lista de clientes e filtra por nome, email, cidade ou telefone. Linhas incompletas, inválidas ou duplicadas são descartadas; falhas na fonte retornam erro JSON sem detalhes internos.

## Estrutura

```text
public/index.php     front controller e ponto de entrada do servidor
bootstrap/            configuração da aplicação e autoload
routes/               definição das rotas
core/                 container, request, response e router
src/Controllers/      controladores
src/Repositories/     acesso e normalização dos dados
src/Views/             interface HTML
public/assets/        CSS e JavaScript
data/                 fonte de dados
```

## Testes automatizados

`ServiceContainer` constrói dependências, reutiliza singletons e rejeita ciclos ou fábricas de tipo incompatível. `HttpRouter` seleciona a rota e devolve uma `Response`; somente `Response::send()` envia os cabeçalhos, inclusive `Allow` em respostas 405. Isso permite testar o roteamento sem emitir uma resposta HTTP.

`tests/fixtures/` contém entradas controladas para os testes. `noisy.php` emite texto propositalmente para verificar que uma fonte defeituosa é rejeitada sem contaminar o JSON. Esses arquivos não fazem parte dos dados da aplicação nem ficam no diretório público.

Os testes não usam pacotes externos. O Composer fornece o autoload e os scripts de execução. Execute na raiz do projeto:

```sh
composer test
```

O runner PHP inicia um servidor temporário e verifica a interface, o endpoint, filtros, rotas inválidas e método não permitido. O teste Node verifica a mesclagem da importação, incluindo preservação da lista atual, descarte de duplicidades, ordenação sem mutação e formatação de telefones.

## Problemas encontrados no projeto inicial

- O frontend solicitava `action=list`, mas a API só respondia a `action=report`.
- O JavaScript procurava `#relatorios`, enquanto o HTML declarava `#relatorio`.
- Os valores de nome e email estavam invertidos em relação aos cabeçalhos da tabela.
- A API não retornava erro para ações desconhecidas nem tratava falhas de leitura ou formato da fonte.
- A interface não tinha tratamento de carregamento, erro ou ausência de resultados.

## Paginação

A lista começa com 10 clientes por página. O seletor permite alternar para 25 ou 50 clientes, e os controles de navegação ficam sincronizados com a busca e o filtro de cidade.

Os cabeçalhos de nome, cidade, email e telefone são acionáveis: o primeiro clique ordena em ordem crescente e o segundo inverte para decrescente. A ordenação mantém a página atual sincronizada com os filtros.

Nome, email e telefone podem ser clicados para copiar o valor para o clipboard. A mesma ação pode ser executada pelo teclado com `Enter` ou `Espaço`. Após uma cópia bem-sucedida, a interface exibe um toast de confirmação que desaparece automaticamente depois de três segundos.

## Importação e exportação

`Exportar CSV` baixa todos os clientes atualmente carregados em CSV UTF-8 compatível com Excel. `Importar clientes` aceita CSV com as colunas `id`, `nome`, `email`, `cidade` e `telefone`, ou um JSON em formato de lista ou `{ "data": [...] }`. A importação valida campos e duplicidades, adiciona somente clientes novos (ID e email únicos) e mantém os dados apenas na sessão atual do navegador; o arquivo PHP original não é alterado. Registros já existentes são informados e ignorados. Clientes importados também participam da busca, ordenação, paginação e exportação enquanto a página estiver aberta.

## API

As falhas de dados usam `App\Exceptions\CustomerDataException`. Problemas ao resolver serviços usam `Core\Exceptions\DependencyResolutionException`; ciclos usam sua especialização `CircularDependencyException`. As causas originais são preservadas em `getPrevious()` quando há encapsulamento, enquanto a resposta pública de erro continua genérica.

Os testes também cobrem fonte ausente, vazia, inválida ou com falha, normalização e duplicidades, restauração do buffer, configurações inválidas do container e imutabilidade dos cabeçalhos. Execute `composer test` ou, sem Composer disponível, `php tests/run.php` e `node tests/frontend.test.js`.

A busca aceita vários termos em qualquer ordem e ignora caixa e acentos portugueses: `SAO ANA` encontra Ana Pereira em São Paulo. Cada termo pode aparecer no nome, email, cidade ou telefone, com ou sem máscara. A mesma regra de termos é aplicada no filtro local da interface. Os telefones são mantidos sem máscara nos dados e formatados apenas na exibição, no padrão `(11) 98765-4321`.

O controlador delega a busca a `src/Services/CustomerSearch.php`, permitindo testar essa regra sem servidor. O repositório rejeita saídas inesperadas do arquivo de dados para preservar o JSON. Uma lista vazia é exibida como estado vazio, e a exportação CSV neutraliza valores que poderiam ser interpretados como fórmulas por planilhas.

`GET /api/customers?busca=<termo>` retorna os clientes válidos. O parâmetro opcional filtra por nome, email ou cidade. A resposta usa JSON com UTF-8 e os erros das rotas `/api` também retornam JSON.

Os dados originais em `data/clientes.php` permanecem intactos.
