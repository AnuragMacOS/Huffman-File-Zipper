/**
 * FileZipper - Minimalist Universal Huffman Compressor & Decompressor
 * Preserves state per tab so switching tabs never erases uploaded files.
 */

class HuffmanNode {
    constructor(byteVal, freq, left = null, right = null) {
        this.byteVal = byteVal;
        this.freq = freq;
        this.left = left;
        this.right = right;
    }
}

class PriorityQueue {
    constructor() {
        this.elements = [];
    }
    push(node) {
        this.elements.push(node);
        this.elements.sort((a, b) => a.freq - b.freq);
    }
    pop() {
        return this.elements.shift();
    }
    get size() {
        return this.elements.length;
    }
}

// Per-tab state storage
const tabStates = {
    compress: {
        file: null,
        blob: null,
        filename: '',
        stats: null
    },
    decompress: {
        file: null,
        blob: null,
        filename: '',
        stats: null
    }
};

let currentMode = 'compress'; // 'compress' | 'decompress'

// DOM Elements
const tabCompress = document.getElementById('tab-compress');
const tabDecompress = document.getElementById('tab-decompress');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const dropPrompt = document.getElementById('drop-prompt');
const dropText = document.getElementById('drop-text');
const dropSubtext = document.getElementById('drop-subtext');
const fileCard = document.getElementById('file-card');
const fileExtBadge = document.getElementById('file-ext-badge');
const fileNameText = document.getElementById('file-name-text');
const fileSizeText = document.getElementById('file-size-text');
const removeBtn = document.getElementById('remove-btn');
const closeBtn = document.getElementById('close-btn');
const cancelBtn = document.getElementById('cancel-btn');
const downloadBtn = document.getElementById('download-btn');
const statsCard = document.getElementById('stats-card');
const labelOrigSize = document.getElementById('label-orig-size');
const valOrigSize = document.getElementById('val-orig-size');
const labelOutSize = document.getElementById('label-out-size');
const valOutSize = document.getElementById('val-out-size');
const valRatio = document.getElementById('val-ratio');

function init() {
    tabCompress.addEventListener('click', () => setMode('compress'));
    tabDecompress.addEventListener('click', () => setMode('decompress'));

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearCurrentTabState();
    });

    cancelBtn.addEventListener('click', clearCurrentTabState);
    closeBtn.addEventListener('click', clearCurrentTabState);
    downloadBtn.addEventListener('click', triggerDownload);
}

function setMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;

    if (mode === 'compress') {
        tabCompress.classList.add('active');
        tabCompress.setAttribute('aria-selected', 'true');
        tabDecompress.classList.remove('active');
        tabDecompress.setAttribute('aria-selected', 'false');

        modalTitle.textContent = 'Upload files';
        modalSubtitle.textContent = 'Upload files to compress';
        dropText.innerHTML = 'Drag & drop or <span class="choose-link">choose file</span>';
        dropSubtext.textContent = 'TXT, DOC, PDF, JPG, PNG • All formats supported';
        fileInput.removeAttribute('accept');
    } else {
        tabDecompress.classList.add('active');
        tabDecompress.setAttribute('aria-selected', 'true');
        tabCompress.classList.remove('active');
        tabCompress.setAttribute('aria-selected', 'false');

        modalTitle.textContent = 'Decompress archive';
        modalSubtitle.textContent = 'Extract your .huf file back to original';
        dropText.innerHTML = 'Drag & drop or <span class="choose-link">choose .huf file</span>';
        dropSubtext.textContent = 'Select any .huf archive to restore original file';
        fileInput.setAttribute('accept', '.huf');
    }

    renderCurrentTabUI();
}

function renderCurrentTabUI() {
    const state = tabStates[currentMode];
    fileInput.value = '';

    if (state.file) {
        const ext = state.file.name.split('.').pop().toUpperCase() || 'FILE';
        fileExtBadge.textContent = ext.slice(0, 4);
        fileNameText.textContent = state.file.name;
        fileSizeText.textContent = formatBytes(state.file.size);

        dropPrompt.classList.add('hidden');
        fileCard.classList.remove('hidden');

        if (state.stats) {
            labelOrigSize.textContent = state.stats.labelOrig;
            valOrigSize.textContent = state.stats.valOrig;
            labelOutSize.textContent = state.stats.labelOut;
            valOutSize.textContent = state.stats.valOut;
            valRatio.textContent = state.stats.ratio;
            valRatio.className = state.stats.ratioClass;
            statsCard.classList.remove('hidden');
        } else {
            statsCard.classList.add('hidden');
        }

        downloadBtn.disabled = !state.blob;
        downloadBtn.textContent = currentMode === 'compress' ? 'Download' : 'Extract File';
    } else {
        fileCard.classList.add('hidden');
        dropPrompt.classList.remove('hidden');
        statsCard.classList.add('hidden');
        downloadBtn.disabled = true;
        downloadBtn.textContent = currentMode === 'compress' ? 'Download' : 'Extract File';
    }
}

function handleFile(file) {
    const state = tabStates[currentMode];
    state.file = file;
    state.blob = null;
    state.filename = '';
    state.stats = null;

    renderCurrentTabUI();
    processFile(file);
}

function clearCurrentTabState() {
    tabStates[currentMode] = {
        file: null,
        blob: null,
        filename: '',
        stats: null
    };
    renderCurrentTabUI();
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function processFile(file) {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Processing...';

    try {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        const isHuf = file.name.toLowerCase().endsWith('.huf');

        if (currentMode === 'decompress' || isHuf) {
            decompressData(data, file.name);
        } else {
            compressData(data, file.name);
        }

        renderCurrentTabUI();
    } catch (err) {
        console.error(err);
        alert('Could not process file: ' + err.message);
        clearCurrentTabState();
    }
}

// Universal 256-byte Huffman Compression
function compressData(data, filename) {
    const totalBytes = data.length;
    const freq = new Array(256).fill(0);
    for (let i = 0; i < totalBytes; i++) {
        freq[data[i]]++;
    }

    const pq = new PriorityQueue();
    let uniqueCount = 0;
    for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
            pq.push(new HuffmanNode(i, freq[i]));
            uniqueCount++;
        }
    }

    if (uniqueCount === 0) {
        throw new Error('File is empty.');
    }

    let root = null;
    if (pq.size === 1) {
        const only = pq.pop();
        root = new HuffmanNode(null, only.freq, only, null);
    } else {
        while (pq.size > 1) {
            const left = pq.pop();
            const right = pq.pop();
            const parent = new HuffmanNode(null, left.freq + right.freq, left, right);
            pq.push(parent);
        }
        root = pq.pop();
    }

    const codes = new Array(256).fill('');
    function traverse(node, code) {
        if (!node) return;
        if (node.byteVal !== null) {
            codes[node.byteVal] = code === '' ? '0' : code;
            return;
        }
        traverse(node.left, code + '0');
        traverse(node.right, code + '1');
    }
    traverse(root, '');

    const filenameUtf8 = new TextEncoder().encode(filename);
    const headerParts = [];

    // Magic HUF3
    headerParts.push(new Uint8Array([0x48, 0x55, 0x46, 0x33]));
    headerParts.push(new Uint8Array([filenameUtf8.length]));
    headerParts.push(filenameUtf8);

    // Total original size
    const sizeBuffer = new ArrayBuffer(8);
    new DataView(sizeBuffer).setBigUint64(0, BigInt(totalBytes));
    headerParts.push(new Uint8Array(sizeBuffer));

    // Unique count
    const uniqueBuffer = new ArrayBuffer(2);
    new DataView(uniqueBuffer).setUint16(0, uniqueCount);
    headerParts.push(new Uint8Array(uniqueBuffer));

    // Codebook
    const codebookBytes = [];
    for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
            const c = codes[i];
            codebookBytes.push(i);
            codebookBytes.push(c.length);

            let packed = 0;
            let bitCount = 0;
            for (let b = 0; b < c.length; b++) {
                packed = (packed << 1) | (c[b] === '1' ? 1 : 0);
                bitCount++;
                if (bitCount === 8) {
                    codebookBytes.push(packed);
                    packed = 0;
                    bitCount = 0;
                }
            }
            if (bitCount > 0) {
                packed <<= (8 - bitCount);
                codebookBytes.push(packed);
            }
        }
    }
    headerParts.push(new Uint8Array(codebookBytes));

    // Payload
    let totalBits = 0;
    for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) totalBits += freq[i] * codes[i].length;
    }
    const payload = new Uint8Array(Math.ceil(totalBits / 8));
    let currentByte = 0;
    let bitOffset = 0;
    let outIdx = 0;

    for (let i = 0; i < totalBytes; i++) {
        const code = codes[data[i]];
        for (let b = 0; b < code.length; b++) {
            currentByte = (currentByte << 1) | (code[b] === '1' ? 1 : 0);
            bitOffset++;
            if (bitOffset === 8) {
                payload[outIdx++] = currentByte;
                currentByte = 0;
                bitOffset = 0;
            }
        }
    }
    if (bitOffset > 0) {
        currentByte <<= (8 - bitOffset);
        payload[outIdx++] = currentByte;
    }
    headerParts.push(payload);

    const blob = new Blob(headerParts, { type: 'application/octet-stream' });
    const saved = ((totalBytes - blob.size) / totalBytes) * 100;

    tabStates.compress.blob = blob;
    tabStates.compress.filename = filename + '.huf';
    tabStates.compress.stats = {
        labelOrig: 'Original',
        valOrig: formatBytes(totalBytes),
        labelOut: 'Compressed',
        valOut: formatBytes(blob.size),
        ratio: saved > 0 ? `-${saved.toFixed(1)}%` : `+${Math.abs(saved).toFixed(1)}%`,
        ratioClass: saved > 0 ? 'ratio-pill' : 'ratio-pill neutral'
    };
}

// Universal Decompression
function decompressData(data, filename) {
    let offset = 0;
    if (data[0] !== 0x48 || data[1] !== 0x55 || data[2] !== 0x46 || data[3] !== 0x33) {
        throw new Error('Not a valid .huf file created with this app.');
    }
    offset += 4;

    const nameLen = data[offset++];
    const nameBytes = data.slice(offset, offset + nameLen);
    offset += nameLen;
    const restoredName = new TextDecoder().decode(nameBytes);

    const origSizeView = new DataView(data.buffer, data.byteOffset + offset, 8);
    const totalOriginalBytes = Number(origSizeView.getBigUint64(0));
    offset += 8;

    const uniqueView = new DataView(data.buffer, data.byteOffset + offset, 2);
    const uniqueCount = uniqueView.getUint16(0);
    offset += 2;

    const root = new HuffmanNode(null, 0);
    for (let u = 0; u < uniqueCount; u++) {
        const sym = data[offset++];
        const codeLen = data[offset++];

        let code = '';
        let rem = codeLen;
        while (rem > 0) {
            const b = data[offset++];
            const take = rem >= 8 ? 8 : rem;
            for (let i = 7; i >= 8 - take; i--) {
                code += ((b >> i) & 1) ? '1' : '0';
            }
            rem -= take;
        }

        let curr = root;
        for (let i = 0; i < code.length; i++) {
            const bit = code[i];
            if (bit === '0') {
                if (!curr.left) curr.left = new HuffmanNode(null, 0);
                curr = curr.left;
            } else {
                if (!curr.right) curr.right = new HuffmanNode(null, 0);
                curr = curr.right;
            }
        }
        curr.byteVal = sym;
    }

    const output = new Uint8Array(totalOriginalBytes);
    let outIdx = 0;
    let curr = root;

    for (let i = offset; i < data.length && outIdx < totalOriginalBytes; i++) {
        const byte = data[i];
        for (let b = 7; b >= 0 && outIdx < totalOriginalBytes; b--) {
            const bit = (byte >> b) & 1;
            curr = bit === 0 ? curr.left : curr.right;
            if (curr.byteVal !== null) {
                output[outIdx++] = curr.byteVal;
                curr = root;
            }
        }
    }

    const blob = new Blob([output]);
    const restoredFilename = restoredName || filename.replace(/\.huf$/i, '');

    const targetMode = currentMode === 'decompress' ? 'decompress' : 'compress';
    tabStates[targetMode].blob = blob;
    tabStates[targetMode].filename = restoredFilename;
    tabStates[targetMode].stats = {
        labelOrig: 'Archive (.huf)',
        valOrig: formatBytes(data.length),
        labelOut: 'Restored',
        valOut: formatBytes(totalOriginalBytes),
        ratio: '100% Intact',
        ratioClass: 'ratio-pill'
    };
}

function triggerDownload() {
    const state = tabStates[currentMode];
    if (!state.blob) return;

    const url = URL.createObjectURL(state.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', init);
