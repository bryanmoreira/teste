document.addEventListener('DOMContentLoaded', () => {
    createReportApp().start();
});

function mergeClientLists(existingClients, importedClients) {
    const existingIds = new Set(existingClients.map(client => client.id));
    const existingEmails = new Set(existingClients.map(client => client.email.toLowerCase()));
    const newClients = [];

    importedClients.forEach(client => {
        const emailKey = client.email.toLowerCase();
        if (existingIds.has(client.id) || existingEmails.has(emailKey)) return;

        existingIds.add(client.id);
        existingEmails.add(emailKey);
        newClients.push(client);
    });

    return {
        clients: [...existingClients, ...newClients],
        addedCount: newClients.length,
        skippedCount: importedClients.length - newClients.length,
    };
}

function sortClientList(clientList, sortKey = 'nome', direction = 'asc', collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })) {
    return [...clientList].sort((first, second) => {
        const comparison = sortKey === 'id'
            ? first.id - second.id
            : collator.compare(String(first[sortKey]), String(second[sortKey]));

        if (comparison === 0) return first.id - second.id;
        return direction === 'desc' ? -comparison : comparison;
    });
}

function formatPhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    return String(phone);
}

function createReportApp() {
    const ui = getElements();
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
    const state = {
        clients: [],
        currentPage: 1,
        pageSize: Number(ui.pageSize.value),
        sortKey: 'nome',
        sortDirection: 'asc',
        toastTimer: null,
    };

    function normalizeText(value) {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('pt-BR');
    }

    function showNotice(message, variant = 'status-import') {
        ui.status.className = `status ${variant}`;
        ui.status.textContent = message;
        ui.status.hidden = false;
    }

    function showLoading() {
        ui.report.hidden = true;
        ui.status.className = 'status';
        ui.status.textContent = 'Carregando relatório…';
        ui.status.hidden = false;
    }

    function showLoadError() {
        ui.status.className = 'status status-error';
        ui.status.replaceChildren();

        const message = document.createElement('span');
        message.textContent = 'Não foi possível carregar o relatório. Confira a conexão e tente novamente.';

        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.textContent = 'Tentar novamente';
        retryButton.addEventListener('click', loadReport, { once: true });

        ui.status.append(message, retryButton);
    }

    function showToast(message) {
        clearTimeout(state.toastTimer);
        ui.toast.textContent = message;
        ui.toast.hidden = false;
        state.toastTimer = setTimeout(() => {
            ui.toast.hidden = true;
            state.toastTimer = null;
        }, 3000);
    }

    function sortClients(clientList) {
        return sortClientList(clientList, state.sortKey, state.sortDirection, collator);
    }

    function mergeImportedClients(importedClients) {
        const merged = mergeClientLists(state.clients, importedClients);
        state.clients = sortClients(merged.clients);
        return merged;
    }

    async function copyToClipboard(value, label) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const input = document.createElement('textarea');
                input.value = value;
                input.setAttribute('readonly', '');
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.append(input);
                input.select();
                if (!document.execCommand('copy')) throw new Error('copy_failed');
                input.remove();
            }
            showToast(`${label} copiado para a área de transferência.`);
        } catch {
            showNotice(`Não foi possível copiar ${label.toLowerCase()}.`, 'status-error');
        }
    }

    function validateClientList(records, { coerceValues = false } = {}) {
        if (!Array.isArray(records) || records.length === 0) {
            throw new Error('O arquivo não contém clientes.');
        }

        const ids = new Set();
        const emails = new Set();
        const clients = [];

        records.forEach((record, index) => {
            if (!record || typeof record !== 'object' || Array.isArray(record)) {
                throw new Error(`O registro ${index + 1} é inválido.`);
            }

            const client = coerceValues
                ? coerceClientFields(record)
                : record;

            if (!isValidClient(client, coerceValues)) {
                throw new Error(`O registro ${index + 1} tem dados inválidos ou duplicados.`);
            }

            const emailKey = client.email.toLowerCase();
            if (ids.has(client.id) || emails.has(emailKey)) {
                throw new Error(`O registro ${index + 1} tem dados inválidos ou duplicados.`);
            }

            ids.add(client.id);
            emails.add(emailKey);
            clients.push(client);
        });

        return clients;
    }

    function coerceClientFields(record) {
        return {
            id: Number(String(record.id ?? '').trim()),
            nome: String(record.nome ?? '').trim(),
            email: String(record.email ?? '').trim(),
            cidade: String(record.cidade ?? '').trim(),
            telefone: String(record.telefone ?? '').trim(),
        };
    }

    function isValidClient(client, coerceValues) {
        const hasExpectedTypes = coerceValues || (
            Number.isInteger(client.id)
            && typeof client.nome === 'string'
            && typeof client.email === 'string'
            && typeof client.cidade === 'string'
            && typeof client.telefone === 'string'
        );

        return hasExpectedTypes
            && Number.isSafeInteger(client.id)
            && client.id > 0
            && Boolean(client.nome.trim())
            && Boolean(client.cidade.trim())
            && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)
            && /^\d{10,11}$/.test(client.telefone);
    }

    function validateApiPayload(payload) {
        if (!payload || !Array.isArray(payload.data) || !payload.meta
            || !Number.isInteger(payload.meta.total)
            || !Number.isInteger(payload.meta.descartados)
            || payload.meta.total !== payload.data.length
            || payload.meta.descartados < 0) {
            throw new Error('Resposta inválida do servidor.');
        }

        return {
            ...payload,
            data: payload.data.length === 0 ? [] : validateClientList(payload.data),
        };
    }

    function parseCsv(text) {
        const input = text.replace(/^\uFEFF/, '');
        const firstLine = input.split(/\r?\n/, 1)[0];
        const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
        const records = [];
        let record = [];
        let field = '';
        let quoted = false;

        for (let index = 0; index < input.length; index += 1) {
            const character = input[index];

            if (quoted) {
                if (character === '"' && input[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else if (character === '"') {
                    quoted = false;
                } else {
                    field += character;
                }
            } else if (character === '"' && field === '') {
                quoted = true;
            } else if (character === delimiter) {
                record.push(field);
                field = '';
            } else if (character === '\n') {
                addCsvRecord(records, record, field);
                record = [];
                field = '';
            } else {
                field += character;
            }
        }

        if (quoted) {
            throw new Error('O CSV possui aspas não fechadas.');
        }
        if (field !== '' || record.length > 0) {
            addCsvRecord(records, record, field);
        }

        return records;
    }

    function addCsvRecord(records, record, field) {
        const values = [...record, field.replace(/\r$/, '')];
        if (values.some(value => value.trim() !== '')) {
            records.push(values);
        }
    }

    function parseImportedText(text, fileName) {
        const extension = fileName.toLowerCase().split('.').pop();
        if (extension === 'json') {
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch {
                throw new Error('O JSON não pôde ser lido.');
            }
            return Array.isArray(parsed) ? parsed : parsed?.data;
        }
        if (extension !== 'csv') {
            throw new Error('Formato não suportado. Escolha um arquivo CSV ou JSON.');
        }

        const rows = parseCsv(text);
        if (rows.length < 2) {
            throw new Error('O CSV precisa ter cabeçalho e pelo menos um cliente.');
        }

        const headers = rows.shift().map(header => normalizeText(header.trim()));
        const requiredColumns = ['id', 'nome', 'email', 'cidade', 'telefone'];
        if (requiredColumns.some(column => !headers.includes(column))) {
            throw new Error('O CSV precisa das colunas id, nome, email, cidade e telefone.');
        }

        return rows.map(row => Object.fromEntries(
            headers.map((header, index) => [header, row[index] ?? ''])
        ));
    }

    function escapeCsv(value) {
        const text = String(value);
        const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
        return `"${safe.replace(/"/g, '""')}"`;
    }

    function exportClients() {
        if (state.clients.length === 0) {
            showNotice('Não há clientes disponíveis para exportar.', 'status-error');
            return;
        }

        const columns = ['id', 'nome', 'email', 'cidade', 'telefone'];
        const rows = [columns, ...state.clients.map(client => columns.map(column => client[column]))];
        const csv = '\uFEFF' + rows.map(row => row.map(escapeCsv).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');

        link.href = url;
        link.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);

        showNotice(`${state.clients.length} ${state.clients.length === 1 ? 'cliente exportado' : 'clientes exportados'} em CSV.`);
    }

    async function importClients(file) {
        try {
            const records = parseImportedText(await file.text(), file.name);
            const importedClients = validateClientList(records, { coerceValues: true });
            const { addedCount, skippedCount } = mergeImportedClients(importedClients);
            resetFilters();
            renderSummary(0);
            renderTable();
            ui.report.hidden = false;

            const addedMessage = addedCount === 0
                ? 'Nenhum cliente novo foi adicionado'
                : `${addedCount} ${addedCount === 1 ? 'novo cliente foi adicionado' : 'novos clientes foram adicionados'}`;
            const skippedMessage = skippedCount > 0
                ? ` ${skippedCount} ${skippedCount === 1 ? 'registro já existia' : 'registros já existiam'}.`
                : '.';
            showNotice(`${addedMessage} de "${file.name}".${skippedMessage} Total na lista: ${state.clients.length}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Não foi possível importar o arquivo.';
            showNotice(message, 'status-error');
        } finally {
            ui.importFile.value = '';
        }
    }

    function renderSummary(discarded) {
        const cityCounts = new Map();
        state.clients.forEach(client => {
            cityCounts.set(client.cidade, (cityCounts.get(client.cidade) || 0) + 1);
        });

        const topCity = [...cityCounts]
            .sort((first, second) => second[1] - first[1] || collator.compare(first[0], second[0]))[0];

        ui.totalClients.textContent = String(state.clients.length);
        ui.totalCities.textContent = String(cityCounts.size);
        ui.topCity.textContent = topCity ? topCity[0] : '—';
        ui.topCityCount.textContent = topCity
            ? `${topCity[1]} ${topCity[1] === 1 ? 'cliente' : 'clientes'}`
            : 'Sem registros';

        ui.cityFilter.replaceChildren(new Option('Todas as cidades', ''));
        [...cityCounts.keys()]
            .sort(collator.compare)
            .forEach(city => ui.cityFilter.add(new Option(city, city)));

        if (discarded > 0) {
            showNotice(`${discarded} ${discarded === 1 ? 'registro foi descartado' : 'registros foram descartados'} por inconsistência na fonte.`);
        } else {
            ui.status.hidden = true;
        }
    }

    function renderTable() {
        const filteredClients = getFilteredClients();
        const totalPages = Math.max(1, Math.ceil(filteredClients.length / state.pageSize));
        state.currentPage = Math.min(state.currentPage, totalPages);

        const firstIndex = (state.currentPage - 1) * state.pageSize;
        const visibleClients = filteredClients.slice(firstIndex, firstIndex + state.pageSize);
        const fragment = document.createDocumentFragment();

        visibleClients.forEach(client => fragment.append(createClientRow(client)));
        ui.rows.replaceChildren(fragment);

        renderResultCount(firstIndex, visibleClients.length, filteredClients.length);
        renderEmptyState(filteredClients.length === 0);
        renderPagination(totalPages, filteredClients.length > 0);
    }

    function updateSortControls() {
        ui.sortButtons.forEach(button => {
            const header = button.closest('th');
            const indicator = button.querySelector('.sort-indicator');
            const isActive = button.dataset.sortKey === state.sortKey;
            const directionLabel = state.sortDirection === 'asc' ? 'crescente' : 'decrescente';

            header.setAttribute('aria-sort', isActive ? state.sortDirection === 'asc' ? 'ascending' : 'descending' : 'none');
            indicator.textContent = isActive ? state.sortDirection === 'asc' ? '↑' : '↓' : '↕';
            button.setAttribute('aria-label', isActive
                ? `Ordenar por ${button.dataset.sortKey}, ordem ${directionLabel}. Ative para inverter.`
                : `Ordenar por ${button.dataset.sortKey}.`);
        });
    }

    function changeSort(sortKey) {
        if (state.sortKey === sortKey) {
            state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortKey = sortKey;
            state.sortDirection = 'asc';
        }

        state.currentPage = 1;
        state.clients = sortClients(state.clients);
        updateSortControls();
        renderTable();
    }

    function getFilteredClients() {
        const searchTerms = normalizeText(ui.search.value.trim()).split(/\s+/).filter(Boolean);
        const selectedCity = ui.cityFilter.value;

        return state.clients.filter(client => {
            const matchesCity = !selectedCity || client.cidade === selectedCity;
            const searchableText = normalizeText(`${client.nome} ${client.email} ${client.cidade} ${client.telefone} ${formatPhone(client.telefone)}`);
            const matchesSearch = searchTerms.every(term => searchableText.includes(term));
            return matchesCity && matchesSearch;
        });
    }

    function createClientRow(client) {
        const row = document.createElement('tr');
        appendCell(row, 'Nome', client.nome, 'client-name', client.nome);
        appendCell(row, 'Cidade', client.cidade);
        appendCell(row, 'Email', client.email, '', client.email);
        appendCell(row, 'Telefone', formatPhone(client.telefone), '', formatPhone(client.telefone));
        return row;
    }

    function appendCell(row, label, value, className = '', copyValue = null) {
        const cell = document.createElement('td');
        cell.dataset.label = label;
        cell.textContent = value;
        if (className) cell.className = className;
        if (copyValue !== null) {
            cell.classList.add('copyable-cell');
            cell.tabIndex = 0;
            cell.role = 'button';
            cell.title = `Copiar ${label.toLowerCase()}`;
            cell.setAttribute('aria-label', `${label}: ${value}. Clique para copiar.`);
            cell.addEventListener('click', () => copyToClipboard(copyValue, label));
            cell.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    copyToClipboard(copyValue, label);
                }
            });
        }
        row.append(cell);
    }

    function renderResultCount(firstIndex, visibleCount, totalCount) {
        if (totalCount === 0) {
            ui.resultCount.textContent = `0 de ${state.clients.length} ${state.clients.length === 1 ? 'cliente' : 'clientes'}`;
            return;
        }

        const lastIndex = Math.min(firstIndex + visibleCount, totalCount);
        ui.resultCount.textContent = `${firstIndex + 1}–${lastIndex} de ${totalCount} ${totalCount === 1 ? 'cliente' : 'clientes'}`;
    }

    function renderEmptyState(isEmpty) {
        ui.tableWrap.hidden = isEmpty;
        ui.emptyState.hidden = !isEmpty;
        ui.emptyState.textContent = state.clients.length === 0
            ? 'Nenhum cliente disponível na fonte de dados.'
            : 'Nenhum cliente encontrado. Ajuste a busca ou o filtro de cidade.';
    }

    function renderPagination(totalPages, hasResults) {
        ui.pagination.hidden = !hasResults;
        ui.pageNumbers.replaceChildren();

        for (let page = 1; page <= totalPages; page += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'page-button';
            button.textContent = String(page);
            button.setAttribute('aria-label', `Ir para a página ${page}`);
            button.setAttribute('aria-current', page === state.currentPage ? 'page' : 'false');
            button.addEventListener('click', () => {
                state.currentPage = page;
                renderTable();
            });
            ui.pageNumbers.append(button);
        }

        ui.previousPage.disabled = state.currentPage === 1;
        ui.nextPage.disabled = state.currentPage === totalPages;
    }

    async function loadReport() {
        showLoading();

        try {
            const response = await fetch('/api/customers', {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw new Error('Falha na solicitação.');

            const customers = await response.json();
            const payload = validateApiPayload({
                data: customers,
                meta: {
                    total: Array.isArray(customers) ? customers.length : 0,
                    descartados: 0,
                },
            });
            state.clients = sortClients(payload.data);
            resetFilters();
            renderSummary(payload.meta.descartados);
            updateSortControls();
            renderTable();
            ui.report.hidden = false;
        } catch {
            showLoadError();
        }
    }

    function resetFilters() {
        state.currentPage = 1;
        ui.search.value = '';
        ui.cityFilter.value = '';
    }

    function bindEvents() {
        ui.search.addEventListener('input', () => {
            state.currentPage = 1;
            renderTable();
        });

        ui.cityFilter.addEventListener('change', () => {
            state.currentPage = 1;
            renderTable();
        });

        ui.pageSize.addEventListener('change', () => {
            state.pageSize = Number(ui.pageSize.value);
            state.currentPage = 1;
            renderTable();
        });

        ui.previousPage.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage -= 1;
                renderTable();
            }
        });

        ui.nextPage.addEventListener('click', () => {
            state.currentPage += 1;
            renderTable();
        });

        ui.sortButtons.forEach(button => {
            button.addEventListener('click', () => changeSort(button.dataset.sortKey));
        });

        ui.exportButton.addEventListener('click', exportClients);
        ui.importButton.addEventListener('click', () => ui.importFile.click());
        ui.importFile.addEventListener('change', () => {
            const [file] = ui.importFile.files;
            if (file) importClients(file);
        });
    }

    return {
        start() {
            bindEvents();
            loadReport();
        },
    };
}

function getElements() {
    return {
        report: document.querySelector('#relatorio'),
        status: document.querySelector('#status'),
        toast: document.querySelector('#toast'),
        totalClients: document.querySelector('#total-clients'),
        totalCities: document.querySelector('#total-cities'),
        topCity: document.querySelector('#top-city'),
        topCityCount: document.querySelector('#top-city-count'),
        search: document.querySelector('#search'),
        cityFilter: document.querySelector('#city-filter'),
        pageSize: document.querySelector('#page-size'),
        rows: document.querySelector('#client-rows'),
        tableWrap: document.querySelector('#table-wrap'),
        emptyState: document.querySelector('#empty-state'),
        pagination: document.querySelector('#pagination'),
        resultCount: document.querySelector('#result-count'),
        previousPage: document.querySelector('#previous-page'),
        nextPage: document.querySelector('#next-page'),
        pageNumbers: document.querySelector('#page-numbers'),
        sortButtons: [...document.querySelectorAll('[data-sort-key]')],
        importButton: document.querySelector('#import-button'),
        exportButton: document.querySelector('#export-button'),
        importFile: document.querySelector('#import-file'),
    };
}
