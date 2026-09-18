'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'public', 'assets', 'js', 'app.js'), 'utf8');
const sandbox = {
    document: {
        addEventListener() {},
    },
};

vm.runInNewContext(source, sandbox, { filename: 'public/assets/js/app.js' });

const mergeClientLists = sandbox.mergeClientLists;
const sortClientList = sandbox.sortClientList;
const formatPhone = sandbox.formatPhone;
assert.equal(typeof mergeClientLists, 'function', 'mergeClientLists deve estar disponível para teste');
assert.equal(typeof sortClientList, 'function', 'sortClientList deve estar disponível para teste');
assert.equal(typeof formatPhone, 'function', 'formatPhone deve estar disponível para teste');

const existing = [
    { id: 1, nome: 'Ana', email: 'ana@example.com', cidade: 'São Paulo', telefone: '11987654321' },
];
const imported = [
    { id: 1, nome: 'Ana duplicada', email: 'outra@example.com', cidade: 'Santos', telefone: '13987654321' },
    { id: 2, nome: 'Bruno', email: 'bruno@example.com', cidade: 'Campinas', telefone: '19987654321' },
    { id: 3, nome: 'Carla', email: 'ANA@EXAMPLE.COM', cidade: 'Sorocaba', telefone: '15987654321' },
];

const result = mergeClientLists(existing, imported);
assert.equal(JSON.stringify(result), JSON.stringify({
    clients: [existing[0], imported[1]],
    addedCount: 1,
    skippedCount: 2,
}));
assert.equal(existing.length, 1, 'a lista existente não deve ser alterada por referência');

const sortableClients = [
    { id: 1, nome: 'Zeca', email: 'zeca@example.com', cidade: 'Santos', telefone: '13987654321' },
    { id: 2, nome: 'Ana', email: 'ana@example.com', cidade: 'Campinas', telefone: '19987654321' },
    { id: 3, nome: 'Bruno', email: 'bruno@example.com', cidade: 'São Paulo', telefone: '11987654321' },
];
assert.equal(JSON.stringify(sortClientList(sortableClients, 'nome', 'asc').map(client => client.id)), '[2,3,1]');
assert.equal(JSON.stringify(sortClientList(sortableClients, 'nome', 'desc').map(client => client.id)), '[1,3,2]');
assert.equal(JSON.stringify(sortClientList(sortableClients, 'id', 'desc').map(client => client.id)), '[3,2,1]');
assert.equal(formatPhone('11987654321'), '(11) 98765-4321');
assert.equal(formatPhone('1198765432'), '(11) 9876-5432');
assert.equal(formatPhone('123'), '123');

console.log('OK  importação adiciona clientes novos e preserva a lista atual');
console.log('OK  colunas podem ser ordenadas em ordem crescente e decrescente');

const duplicateBatch = mergeClientLists([], [imported[1], { ...imported[1], id: 99 }]);
assert.equal(duplicateBatch.addedCount, 1);
assert.equal(duplicateBatch.skippedCount, 1);
const snapshot = JSON.stringify(sortableClients);
sortClientList(sortableClients, 'nome', 'desc');
assert.equal(JSON.stringify(sortableClients), snapshot);
assert.equal(mergeClientLists(existing, []).clients.length, existing.length);
assert.equal(sortClientList([], 'nome').length, 0);
console.log('OK  duplicados no mesmo lote, listas vazias e ordenação sem mutação');
console.log('OK  telefones são formatados para exibição');
