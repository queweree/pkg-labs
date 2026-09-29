self.analyzeFile = analyzeFile;

self.onmessage = async (event) => {
    const { index, file } = event.data;

    try {
        const result = await analyzeFile(file);
        self.postMessage({ type: 'result', index, result });
    } catch (error) {
        self.postMessage({
            type: 'result',
            index,
            result: {
                name: file.name,
                size: file.size,
                format: '—',
                width: null,
                height: null,
                colorDepth: null,
                palette: null,
                compression: null,
                resolution: null,
                status: 'Файл поврежден',
                error: error.message
            }
        });
    }
};

async function analyzeFile(file) {
    if (file.size === 0) {
        throw new Error('Файл пуст');
    }

    const headerSize = Math.min(file.size, 64 * 1024);
    const headerBuffer = await file.slice(0, headerSize).arrayBuffer();
    const header = new Uint8Array(headerBuffer);
    const format = detectFormat(header);

    if (format !== 'UNKNOWN' && isRenamedExtension(file.name, format)) {
        const result = await parseByFormat(file, header, format);
        result.status = 'Расширение переименовано';
        return result;
    }
    switch (format) {
        case 'BMP':
            return parseBmp(file, header);
        case 'PNG':
            return parsePng(file, header);
        case 'JPEG':
            return parseJpeg(file, header);
        case 'GIF':
            return parseGif(file, header);
        case 'PCX':
            return parsePcx(file, header);
        case 'TIFF':
            return parseTiff(file, header);
        default:
            return {
                name: file.name,
                size: file.size,
                format: 'UNKNOWN',
                width: null,
                height: null,
                colorDepth: null,
                palette: null,
                compression: null,
                resolution: null,
                status: 'Неподдерживаемый формат'
            };
    }
}

function detectFormat(bytes) {
    if (bytes.length >= 3 &&
        bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'JPEG';
    }

    if (bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E &&
        bytes[3] === 0x47 && bytes[4] === 0x0D && bytes[5] === 0x0A &&
        bytes[6] === 0x1A && bytes[7] === 0x0A) {
        return 'PNG';
    }

    if (bytes.length >= 6 &&
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
        bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61) {
        return 'GIF';
    }

    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4D) {
        return 'BMP';
    }

    if (bytes.length >= 4 && (
        (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
        (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)
    )) {
        return 'TIFF';
    }

    if (bytes.length >= 2 && bytes[0] === 0x0A && bytes[1] === 0x05) {
        return 'PCX';
    }

    return 'UNKNOWN';
}

function isRenamedExtension(fileName, actualFormat) {
    const extension = fileName.split('.').pop().toLowerCase();

    const expectedExtensions = {
        JPEG: ['jpg', 'jpeg'],
        PNG: ['png'],
        GIF: ['gif'],
        BMP: ['bmp'],
        TIFF: ['tif', 'tiff'],
        PCX: ['pcx']
    };

    const allowed = expectedExtensions[actualFormat];

    if (!allowed) {
        return false;
    }

    return !allowed.includes(extension);
}

async function parseBmp(file, header) {
    if (file.size < 54) throw new Error('BMP header is larger than file');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (view.getUint16(0, true) !== 0x4D42) throw new Error('Invalid BMP signature');

    const declaredSize = view.getUint32(2, true);
    const pixelDataOffset = view.getUint32(10, true);
    const infoHeaderSize = view.getUint32(14, true);

    if (infoHeaderSize < 40) throw new Error('Unsupported BMP info header');
    if (file.size < 14 + infoHeaderSize) throw new Error('BMP header is larger than file');
    if (declaredSize !== 0 && declaredSize > file.size) throw new Error('BMP declared size exceeds file');
    if (pixelDataOffset >= file.size) throw new Error('Invalid BMP pixel data offset');

    const width = view.getInt32(18, true);
    const rawHeight = view.getInt32(22, true);
    const height = Math.abs(rawHeight);
    const planes = view.getUint16(26, true);
    const bitsPerPixel = view.getUint16(28, true);
    const compressionCode = view.getUint32(30, true);
    const xPixelsPerMeter = view.getInt32(38, true);
    const yPixelsPerMeter = view.getInt32(42, true);
    const colorsUsed = view.getUint32(46, true);

    if (planes !== 1 || width <= 0 || height <= 0) throw new Error('Invalid BMP parameters');

    return {
        name: file.name,
        size: file.size,
        format: 'BMP',
        width,
        height,
        colorDepth: `${bitsPerPixel} бит`,
        palette: getBmpPalette(bitsPerPixel, colorsUsed),
        compression: getBmpCompression(compressionCode),
        resolution: getBmpResolution(xPixelsPerMeter, yPixelsPerMeter),
        status: 'Готово'
    };
}
async function parseByFormat(file, header, format) {
    switch (format) {
        case 'BMP':
            return parseBmp(file, header);
        case 'PNG':
            return parsePng(file, header);
        case 'JPEG':
            return parseJpeg(file, header);
        case 'GIF':
            return parseGif(file, header);
        case 'PCX':
            return parsePcx(file, header);
        case 'TIFF':
            return parseTiff(file, header);
        default:
            throw new Error('Unknown format');
    }
}
function getBmpCompression(code) {
    switch (code) {
        case 0: return 'BI_RGB';
        case 1: return 'BI_RLE8';
        case 2: return 'BI_RLE4';
        case 3: return 'BI_BITFIELDS';
        case 4: return 'BI_JPEG';
        case 5: return 'BI_PNG';
        default: return `Код ${code}`;
    }
}

function getBmpPalette(bitsPerPixel, colorsUsed) {
    if (bitsPerPixel > 8) return 'Нет';
    const count = colorsUsed || Math.pow(2, bitsPerPixel);
    return `${count} цветов`;
}

function getBmpResolution(x, y) {
    if (x === 0 || y === 0) return '—';
    return `${Math.round(x * 0.0254)} × ${Math.round(y * 0.0254)} dpi`;
}

async function parsePng(file, header) {
    if (file.size < 33) throw new Error('PNG header is larger than file');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    const bitDepth = view.getUint8(24);
    const colorType = view.getUint8(25);
    const compressionMethod = view.getUint8(26);
    const filterMethod = view.getUint8(27);

    if (view.getUint32(8, false) !== 13) throw new Error('Invalid PNG IHDR size');
    if (readAscii(header, 12, 4) !== 'IHDR') throw new Error('IHDR chunk not found');
    if (width === 0 || height === 0) throw new Error('Invalid PNG dimensions');

    await ensurePngIend(file);

    return {
        name: file.name,
        size: file.size,
        format: 'PNG',
        width,
        height,
        colorDepth: `${bitDepth} bit`,
        palette: getPngColorType(colorType),
        compression: `Deflate / method ${compressionMethod}; filter ${filterMethod}`,
        resolution: await readPngResolution(file),
        status: 'Готово'
    };
}

async function readPngResolution(file) {
    let position = 8;

    while (position + 12 <= file.size) {
        const chunkHeader = new Uint8Array(
            await file.slice(position, position + 8).arrayBuffer()
        );

        if (chunkHeader.length < 8) {
            return '—';
        }

        const length = readUint32BE(chunkHeader, 0);
        const type = readAscii(chunkHeader, 4, 4);

        if (length > file.size - position - 12) {
            return '—';
        }

        if (type === 'pHYs' && length >= 9) {
            const data = new Uint8Array(
                await file.slice(position + 8, position + 8 + 9).arrayBuffer()
            );

            const pixelsPerUnitX = readUint32BE(data, 0);
            const pixelsPerUnitY = readUint32BE(data, 4);
            const unit = data[8];

            if (unit === 1) {
                return `${Math.round(pixelsPerUnitX * 0.0254)} × ${Math.round(pixelsPerUnitY * 0.0254)} dpi`;
            }

            return '—';
        }

        position += 12 + length;
    }

    return '—';
}

async function ensurePngIend(file) {
    let position = 8;

    while (position + 12 <= file.size) {
        const chunk = new Uint8Array(await file.slice(position, position + 12).arrayBuffer());
        const length = readUint32BE(chunk, 0);
        const type = readAscii(chunk, 4, 4);

        if (length > file.size - position - 12) {
            throw new Error('PNG chunk exceeds file size');
        }

        position += 12 + length;

        if (type === 'IEND') return;
    }

    throw new Error('PNG IEND chunk not found');
}

function getPngColorType(type) {
    switch (type) {
        case 0: return 'Оттенки серого';
        case 2: return 'RGB';
        case 3: return 'Палитра';
        case 4: return 'Оттенки серого + alpha';
        case 6: return 'RGBA';
        default: return `Тип ${type}`;
    }
}

async function parseJpeg(file, header) {
    if (file.size < 4 || header[0] !== 0xFF || header[1] !== 0xD8) {
        throw new Error('Invalid JPEG signature');
    }

    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 2), file.size).arrayBuffer());
    if (tail.length !== 2 || tail[0] !== 0xFF || tail[1] !== 0xD9) {
        throw new Error('JPEG EOI marker not found');
    }

    let offset = 2;

    while (offset + 4 <= file.size) {
        const markerHead = new Uint8Array(await file.slice(offset, offset + 4).arrayBuffer());

        if (markerHead[0] !== 0xFF) {
            offset++;
            continue;
        }

        let marker = markerHead[1];
        while (marker === 0xFF) {
            offset++;
            const next = new Uint8Array(await file.slice(offset + 1, offset + 2).arrayBuffer());
            if (next.length === 0) break;
            marker = next[0];
        }

        if (marker === 0xD9 || marker === 0xDA) break;
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
            offset += 2;
            continue;
        }

        const lengthBytes = new Uint8Array(await file.slice(offset + 2, offset + 4).arrayBuffer());
        if (lengthBytes.length < 2) throw new Error('Invalid JPEG segment');

        const length = (lengthBytes[0] << 8) | lengthBytes[1];
        if (length < 2 || offset + 2 + length > file.size) throw new Error('JPEG segment exceeds file');

        if (isJpegSofMarker(marker)) {
            const segment = new Uint8Array(await file.slice(offset + 4, offset + 2 + length).arrayBuffer());
            if (segment.length < 6) throw new Error('Invalid JPEG SOF segment');

            const precision = segment[0];
            const height = (segment[1] << 8) | segment[2];
            const width = (segment[3] << 8) | segment[4];
            const components = segment[5];

            if (width === 0 || height === 0) throw new Error('Invalid JPEG dimensions');

            return {
                name: file.name,
                size: file.size,
                format: 'JPEG',
                width,
                height,
                colorDepth: `${precision} bit`,
                palette: `${components} components`,
                compression: 'JPEG',
                resolution: await readJpegResolution(file),
                status: 'Готово'
            };
        }

        offset += 2 + length;
    }

    throw new Error('JPEG SOF marker not found');
}

function isJpegSofMarker(marker) {
    return [
        0xC0, 0xC1, 0xC2, 0xC3,
        0xC5, 0xC6, 0xC7,
        0xC9, 0xCA, 0xCB,
        0xCD, 0xCE, 0xCF
    ].includes(marker);
}

async function readJpegResolution(file) {
    const size = Math.min(file.size, 256 * 1024);
    const bytes = new Uint8Array(await file.slice(0, size).arrayBuffer());
    let offset = 2;

    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xFF) {
            offset++;
            continue;
        }

        const marker = bytes[offset + 1];
        if (marker === 0xE0 && readAscii(bytes, offset + 4, 5) === 'JFIF\0') {
            const units = bytes[offset + 11];
            const x = (bytes[offset + 12] << 8) | bytes[offset + 13];
            const y = (bytes[offset + 14] << 8) | bytes[offset + 15];
            if (units === 1) return `${x} × ${y} dpi`;
            if (units === 2) return `${Math.round(x * 2.54)} × ${Math.round(y * 2.54)} dpi`;
        }

        if (offset + 4 > bytes.length) break;
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (length < 2) break;
        offset += 2 + length;
    }

    return '—';
}

async function parseGif(file, header) {
    if (file.size < 10) throw new Error('GIF header is larger than file');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    const packed = view.getUint8(10);

    if (width === 0 || height === 0) throw new Error('Invalid GIF dimensions');

    const tail = new Uint8Array(await file.slice(file.size - 1, file.size).arrayBuffer());
    if (tail[0] !== 0x3B) throw new Error('GIF trailer not found');

    return {
        name: file.name,
        size: file.size,
        format: 'GIF',
        width,
        height,
        colorDepth: `${(packed & 0x07) + 1} bit`,
        palette: (packed & 0x80) ? `${2 ** ((packed & 0x07) + 1)} цветов` : 'Нет глобальной палитры',
        compression: 'LZW',
        resolution: '—',
        status: 'Готово'
    };
}

async function parsePcx(file, header) {
    if (file.size < 128) throw new Error('PCX header is larger than file');
    if (header[0] !== 0x0A) throw new Error('Invalid PCX signature');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const version = view.getUint8(1);
    const encoding = view.getUint8(2);
    const bitsPerPixel = view.getUint8(3);
    const colorPlanes = view.getUint8(65);
    const xMin = view.getUint16(4, true);
    const yMin = view.getUint16(6, true);
    const xMax = view.getUint16(8, true);
    const yMax = view.getUint16(10, true);
    const dpiX = view.getUint16(12, true);
    const dpiY = view.getUint16(14, true);

    const width = xMax - xMin + 1;
    const height = yMax - yMin + 1;

    if (width <= 0 || height <= 0) throw new Error('Invalid PCX dimensions');
    if (encoding !== 1) throw new Error('Unsupported PCX encoding');

    return {
        name: file.name,
        size: file.size,
        format: 'PCX',
        width,
        height,
        colorDepth: `${bitsPerPixel * Math.max(colorPlanes, 1)} bit`,
        palette: '—',
        compression: 'RLE',
        resolution: dpiX && dpiY ? `${dpiX} × ${dpiY} dpi` : '—',
        status: 'Готово'
    };
}

async function parseTiff(file, header) {
    if (file.size < 8) throw new Error('TIFF header is larger than file');

    const littleEndian = header[0] === 0x49 && header[1] === 0x49;
    const bigEndian = header[0] === 0x4D && header[1] === 0x4D;
    if (!littleEndian && !bigEndian) throw new Error('Invalid TIFF byte order');

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const magic = view.getUint16(2, littleEndian);
    if (magic !== 42) throw new Error('Invalid TIFF magic');

    const ifdOffset = view.getUint32(4, littleEndian);
    if (ifdOffset + 2 > file.size) throw new Error('TIFF IFD is outside file');

    const countBuffer = new Uint8Array(await file.slice(ifdOffset, ifdOffset + 2).arrayBuffer());
    const entryCount = readUint16(countBuffer, 0, littleEndian);
    const ifdSize = 2 + entryCount * 12 + 4;

    if (ifdOffset + ifdSize > file.size) throw new Error('TIFF IFD exceeds file');

    const ifd = new Uint8Array(await file.slice(ifdOffset, ifdOffset + ifdSize).arrayBuffer());
    const tags = {};

    for (let i = 0; i < entryCount; i++) {
        const offset = 2 + i * 12;
        const tag = readUint16(ifd, offset, littleEndian);
        const type = readUint16(ifd, offset + 2, littleEndian);
        const count = readUint32(ifd, offset + 4, littleEndian);
        const typeSize = getTiffTypeSize(type);
        const totalSize = typeSize * count;

        let valueOffset = offset + 8;
        if (totalSize > 4) {
            valueOffset = readUint32(ifd, offset + 8, littleEndian);
        }

        tags[tag] = { type, count, totalSize, valueOffset, entryOffset: offset };
    }

    const width = await getTiffNumber(file, ifd, tags[256], littleEndian);
    const height = await getTiffNumber(file, ifd, tags[257], littleEndian);
    const bits = await getTiffBits(file, ifd, tags[258], littleEndian);
    const compression = await getTiffNumber(file, ifd, tags[259], littleEndian);
    const resolutionX = await getTiffRational(file, tags[282], littleEndian);
    const resolutionY = await getTiffRational(file, tags[283], littleEndian);
    const resolutionUnit = await getTiffNumber(file, ifd, tags[296], littleEndian);

    if (!width || !height) throw new Error('TIFF Width/Height tags not found');

    return {
        name: file.name,
        size: file.size,
        format: 'TIFF',
        width,
        height,
        colorDepth: bits || '—',
        palette: '—',
        compression: getTiffCompression(compression),
        resolution: formatTiffResolution(resolutionX, resolutionY, resolutionUnit),
        status: 'Готово'
    };
}

function getTiffTypeSize(type) {
    switch (type) {
        case 1: case 2: case 6: case 7: return 1;
        case 3: case 8: return 2;
        case 4: case 9: case 11: return 4;
        case 5: case 10: case 12: return 8;
        default: return 1;
    }
}

async function getTiffNumber(file, ifd, tag, littleEndian) {
    if (!tag) return null;

    if (tag.totalSize <= 4) {
        if (tag.type === 3) return readUint16(ifd, tag.entryOffset + 8, littleEndian);
        return readUint32(ifd, tag.entryOffset + 8, littleEndian);
    }

    const data = new Uint8Array(await file.slice(tag.valueOffset, tag.valueOffset + tag.totalSize).arrayBuffer());
    if (data.length < tag.totalSize) throw new Error('TIFF tag data exceeds file');

    if (tag.type === 3) return readUint16(data, 0, littleEndian);
    return readUint32(data, 0, littleEndian);
}

async function getTiffBits(file, ifd, tag, littleEndian) {
    if (!tag) return null;

    if (tag.type !== 3) return null;
    const count = tag.count;

    if (tag.totalSize <= 4) {
        const value = readUint16(ifd, tag.entryOffset + 8, littleEndian);
        return count === 1 ? `${value} бит/канал` : `${value} бит/канал`;
    }

    const data = new Uint8Array(await file.slice(tag.valueOffset, tag.valueOffset + tag.totalSize).arrayBuffer());
    const values = [];
    for (let i = 0; i < count; i++) values.push(readUint16(data, i * 2, littleEndian));
    return `${values.join(', ')} бит/канал`;
}

async function getTiffRational(file, tag, littleEndian) {
    if (!tag || tag.type !== 5 || tag.totalSize < 8) return null;

    const data = new Uint8Array(await file.slice(tag.valueOffset, tag.valueOffset + 8).arrayBuffer());
    if (data.length < 8) throw new Error('TIFF rational value exceeds file');

    const numerator = readUint32(data, 0, littleEndian);
    const denominator = readUint32(data, 4, littleEndian);
    return denominator === 0 ? null : numerator / denominator;
}

function getTiffCompression(code) {
    const names = {
        1: 'Без сжатия',
        2: 'CCITT Group 3',
        3: 'CCITT Group 3 Fax',
        4: 'CCITT Group 4 Fax',
        5: 'LZW',
        6: 'JPEG',
        7: 'JPEG',
        8: 'Deflate',
        32773: 'PackBits'
    };
    return names[code] || (code == null ? '—' : `Код ${code}`);
}

function formatTiffResolution(x, y, unit) {
    if (!x || !y) return '—';
    if (unit === 3) return `${(x * 2.54).toFixed(1)} × ${(y * 2.54).toFixed(1)} dpi`;
    return `${x.toFixed(1)} × ${y.toFixed(1)} dpi`;
}

function readAscii(bytes, offset, length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += String.fromCharCode(bytes[offset + i] || 0);
    }
    return result;
}

function readUint16(bytes, offset, littleEndian) {
    if (littleEndian) return bytes[offset] | (bytes[offset + 1] << 8);
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset, littleEndian) {
    if (littleEndian) {
        return (bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)) >>> 0;
    }

    return ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>> 0;
}

function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>> 0;
}
