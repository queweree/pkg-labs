const folderInput = document.getElementById('folderInput');
const fileInput = document.getElementById('fileInput');
const clearButton = document.getElementById('clearButton');

const totalFiles = document.getElementById('totalFiles');
const correctFiles = document.getElementById('correctFiles');
const brokenFiles = document.getElementById('brokenFiles');
const unsupportedFiles = document.getElementById('unsupportedFiles');

const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');

const resultsBody = document.getElementById('resultsBody');
const filterInput = document.getElementById('filterInput');

let selectedFiles = [];
let workers = [];
let nextFileIndex = 0;
let processedFiles = 0;
let processingStartedAt = 0;
let processingRun = 0;
let localProcessing = false;

function getWorkerCount() {
    const hardware = navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(hardware, 8));
}

function handleFiles(fileList) {
    stopWorkers();

    selectedFiles = Array.from(fileList || []);
    nextFileIndex = 0;
    processedFiles = 0;
    processingRun++;

    totalFiles.textContent = selectedFiles.length;
    correctFiles.textContent = '0';
    brokenFiles.textContent = '0';
    unsupportedFiles.textContent = '0';

    progressBar.value = 0;
    progressPercent.textContent = '0%';
    progressText.textContent = selectedFiles.length
        ? 'Подготовка анализа...'
        : 'Ожидание файлов';

    renderInitialResults();

    if (selectedFiles.length > 0) {
        startProcessing(processingRun);
    }
}

function renderInitialResults() {
    resultsBody.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const row = document.createElement('tr');
        row.dataset.index = index;

        row.innerHTML = `
            <td>${escapeHtml(file.webkitRelativePath || file.name)}</td>
            <td>—</td>
            <td>${formatFileSize(file.size)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>Анализ...</td>
        `;

        resultsBody.appendChild(row);
    });
}

function startProcessing(runId) {
    processingStartedAt = performance.now();

    // Chrome blocks dedicated workers for pages opened directly via file://.
    // In that case the same byte parser runs asynchronously on the main thread
    // so local testing does not turn worker startup errors into "Файл поврежден".
    if (location.protocol === 'file:' || typeof Worker === 'undefined') {
        localProcessing = true;
        processFilesLocally(runId);
        return;
    }

    localProcessing = false;
    workers = [];

    const count = Math.min(getWorkerCount(), selectedFiles.length);

    try {
        for (let i = 0; i < count; i++) {
            const worker = createWorker(runId);
            workers.push(worker);
        }
    } catch (error) {
        localProcessing = true;
        stopWorkers();
        processFilesLocally(runId);
        return;
    }

    workers.forEach((worker) => processNextFile(worker, runId));
}

async function processFilesLocally(runId) {
    const concurrency = Math.min(4, selectedFiles.length);

    let cursor = 0;

    async function runNext() {
        while (true) {
            if (runId !== processingRun) return;

            const index = cursor++;
            if (index >= selectedFiles.length) return;

            markFileAsProcessing(index);

            try {
                const result = await analyzeFile(selectedFiles[index]);
                updateResult(index, result);
            } catch (error) {
                updateError(index, error?.message || 'Ошибка чтения');
            }

            processedFiles++;
            updateProgress();

            // Give the browser a chance to repaint the progress bar.
            await new Promise((resolve) => setTimeout(resolve, 0));

            if (processedFiles >= selectedFiles.length) {
                finishProcessing();
                return;
            }
        }
    }

    await Promise.all(
        Array.from({ length: concurrency }, () => runNext())
    );
}

function createWorker(runId) {
    const worker = new Worker(new URL('worker.js', document.baseURI));

    worker.onmessage = (event) => {
        if (runId !== processingRun) return;

        if (event.data.type === 'result') {
            updateResult(event.data.index, event.data.result);
            processedFiles++;
            updateProgress();
        }

        if (processedFiles >= selectedFiles.length) {
            finishProcessing();
            return;
        }

        processNextFile(worker, runId);
    };

    worker.onerror = () => {
        if (runId !== processingRun) return;

        const index = worker.currentIndex;
        if (Number.isInteger(index)) {
            updateError(index, 'Ошибка worker');
            processedFiles++;
            updateProgress();
        }

        if (processedFiles >= selectedFiles.length) {
            finishProcessing();
        } else {
            processNextFile(worker, runId);
        }
    };

    return worker;
}

function processNextFile(worker, runId) {
    if (runId !== processingRun) return;

    if (nextFileIndex >= selectedFiles.length) {
        worker.postMessage({ type: 'stop' });
        return;
    }

    const index = nextFileIndex++;
    const file = selectedFiles[index];

    worker.currentIndex = index;
    markFileAsProcessing(index);

    worker.postMessage({
        index,
        file
    });
}

function markFileAsProcessing(index) {
    const row = resultsBody.querySelector(`tr[data-index="${index}"]`);
    if (row) row.cells[7].textContent = 'Чтение...';
}

function updateResult(index, result) {
    const row = resultsBody.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;

    row.cells[1].textContent = formatName(result.format);
    row.cells[2].textContent = formatFileSize(result.size ?? selectedFiles[index].size);
    row.cells[3].textContent = formatDimensions(result.width, result.height);
    row.cells[4].textContent = result.resolution || '—';
    row.cells[5].textContent = result.colorDepth || '—';
    row.cells[6].textContent = result.palette || '—';
    row.cells[7].textContent = result.compression || '—';

    const statusCell = row.cells[8];
    if (statusCell) {
        statusCell.textContent = result.status || '—';
        statusCell.className = getStatusClass(result.status);
    } else {
        row.cells[7].textContent = result.status || '—';
        row.cells[7].className = getStatusClass(result.status);
    }

    if (result.status === 'Файл поврежден') {
        brokenFiles.textContent = Number(brokenFiles.textContent) + 1;
    } else if (result.format === 'UNKNOWN') {
        unsupportedFiles.textContent = Number(unsupportedFiles.textContent) + 1;
    } else {
        correctFiles.textContent = Number(correctFiles.textContent) + 1;
    }
}

function updateError(index, message) {
    const row = resultsBody.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;

    const statusCell = row.cells[8] || row.cells[7];
    statusCell.textContent = 'Файл поврежден';
    statusCell.className = 'status-bad';
    statusCell.title = message;

    brokenFiles.textContent = Number(brokenFiles.textContent) + 1;
}

function updateProgress() {
    const total = selectedFiles.length;
    const percent = total === 0 ? 0 : Math.round((processedFiles / total) * 100);

    progressBar.value = percent;
    progressPercent.textContent = `${percent}%`;

    if (processedFiles === 0) {
        progressText.textContent = `Обработано 0 из ${total}`;
        return;
    }

    const elapsed = (performance.now() - processingStartedAt) / 1000;
    const speed = processedFiles / Math.max(elapsed, 0.001);
    const remaining = Math.max(0, total - processedFiles);
    const seconds = remaining / Math.max(speed, 0.001);

    progressText.textContent =
        `Обработано ${processedFiles} из ${total} · осталось примерно ${formatTime(seconds)}`;
}

function finishProcessing() {
    progressBar.value = 100;
    progressPercent.textContent = '100%';
    progressText.textContent = `Обработано ${selectedFiles.length} из ${selectedFiles.length}`;

    workers.forEach((worker) => worker.terminate());
    workers = [];
}

function stopWorkers() {
    workers.forEach((worker) => worker.terminate());
    workers = [];
    localProcessing = false;
}

function clearResults() {
    processingRun++;
    stopWorkers();

    selectedFiles = [];
    nextFileIndex = 0;
    processedFiles = 0;

    folderInput.value = '';
    fileInput.value = '';

    totalFiles.textContent = '0';
    correctFiles.textContent = '0';
    brokenFiles.textContent = '0';
    unsupportedFiles.textContent = '0';

    progressBar.value = 0;
    progressPercent.textContent = '0%';
    progressText.textContent = 'Ожидание файлов';

    resultsBody.innerHTML = '';
}

function formatDimensions(width, height) {
    if (!width || !height) return '—';
    return `${width} × ${height} px`;
}

function formatName(format) {
    return format === 'UNKNOWN' ? '—' : format;
}

function getStatusClass(status) {
    if (status === 'Готово') return 'status-ok';
    if (status === 'Файл поврежден') return 'status-bad';
    if (status === 'Неподдерживаемый формат') return 'status-unknown';
    return '';
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0 с';
    if (seconds < 60) return `${Math.ceil(seconds)} с`;

    const minutes = Math.floor(seconds / 60);
    const rest = Math.ceil(seconds % 60);
    return `${minutes} мин ${rest} с`;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

folderInput.addEventListener('change', () => handleFiles(folderInput.files));
fileInput.addEventListener('change', () => handleFiles(fileInput.files));
clearButton.addEventListener('click', clearResults);

filterInput.addEventListener('input', () => {
    const query = filterInput.value.trim().toLowerCase();

    Array.from(resultsBody.rows).forEach((row) => {
        row.style.display = row.textContent.toLowerCase().includes(query)
            ? ''
            : 'none';
    });
});
