
const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const imageInfo = document.getElementById("imageInfo");

const grayscaleButton = document.getElementById("grayscaleButton");
const invertButton = document.getElementById("invertButton");
const resetButton = document.getElementById("resetButton");

const brightnessSlider = document.getElementById("brightnessSlider");
const brightnessValue = document.getElementById("brightnessValue");
const applyBrightnessButton = document.getElementById("applyBrightnessButton");

const contrastSlider = document.getElementById("contrastSlider");
const contrastValue = document.getElementById("contrastValue");
const applyContrastButton = document.getElementById("applyContrastButton");

const stretchButton = document.getElementById("stretchButton");

const localMeanWindow = document.getElementById("localMeanWindow");
const localMeanWindowValue = document.getElementById("localMeanWindowValue");
const localMeanOffset = document.getElementById("localMeanOffset");
const localMeanOffsetValue = document.getElementById("localMeanOffsetValue");
const localMeanButton = document.getElementById("localMeanButton");

const niblackK = document.getElementById("niblackK");
const niblackKValue = document.getElementById("niblackKValue");
const niblackButton = document.getElementById("niblackButton");

const resultCanvas = document.getElementById("resultCanvas");
const resultPlaceholder = document.getElementById("resultPlaceholder");
const resultContext = resultCanvas.getContext("2d");

let originalImage = null;
let currentImageUrl = null;

function setProcessingControlsEnabled(enabled) {
    [
        grayscaleButton, invertButton, resetButton,
        brightnessSlider, applyBrightnessButton,
        contrastSlider, applyContrastButton, stretchButton,
        localMeanWindow, localMeanOffset, localMeanButton,
        niblackK, niblackButton
    ].forEach(control => {
        control.disabled = !enabled;
    });
}

function clearResult() {
    resultContext.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCanvas.hidden = true;
    resultPlaceholder.hidden = false;
}

function getOriginalImageData() {
    const canvas = document.createElement("canvas");
    canvas.width = originalImage.naturalWidth;
    canvas.height = originalImage.naturalHeight;

    const context = canvas.getContext("2d");
    context.drawImage(originalImage, 0, 0);

    return context.getImageData(0, 0, canvas.width, canvas.height);
}

function displayImageData(imageData) {
    resultCanvas.width = imageData.width;
    resultCanvas.height = imageData.height;
    resultContext.putImageData(imageData, 0, 0);
    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
}

function showImageInfo(file, image) {
    const sizeInKB = (file.size / 1024).toFixed(1);
    imageInfo.textContent =
        `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px · ${sizeInKB} KB`;
}

function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function getGrayscalePixels(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = Math.round(
            0.299 * data[i] +
            0.587 * data[i + 1] +
            0.114 * data[i + 2]
        );
    }

    return gray;
}

function buildIntegralImage(values, width, height) {
    const stride = width + 1;
    const integral = new Float64Array(stride * (height + 1));

    for (let y = 1; y <= height; y++) {
        let rowSum = 0;

        for (let x = 1; x <= width; x++) {
            rowSum += values[(y - 1) * width + x - 1];
            integral[y * stride + x] =
                integral[(y - 1) * stride + x] + rowSum;
        }
    }

    return integral;
}

function rectangleSum(integral, stride, x1, y1, x2, y2) {
    return integral[y2 * stride + x2]
        - integral[y1 * stride + x2]
        - integral[y2 * stride + x1]
        + integral[y1 * stride + x1];
}

function makeBinaryImage(gray, width, height, thresholdFunction) {
    const output = new ImageData(width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const value = gray[index] > thresholdFunction(x, y) ? 255 : 0;
            const outIndex = index * 4;

            output.data[outIndex] = value;
            output.data[outIndex + 1] = value;
            output.data[outIndex + 2] = value;
            output.data[outIndex + 3] = 255;
        }
    }

    return output;
}

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        imageInfo.textContent = "Please select a valid image file.";
        imageInput.value = "";
        return;
    }

    if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
    currentImageUrl = URL.createObjectURL(file);

    const loadedImage = new Image();

    loadedImage.onload = () => {
        originalImage = loadedImage;
        previewImage.src = currentImageUrl;
        previewImage.hidden = false;
        showImageInfo(file, loadedImage);
        setProcessingControlsEnabled(true);
        clearResult();

        brightnessSlider.value = "0";
        brightnessValue.value = "0";
        brightnessValue.textContent = "0";
        contrastSlider.value = "0";
        contrastValue.value = "0";
        contrastValue.textContent = "0";
    };

    loadedImage.onerror = () => {
        imageInfo.textContent = "The selected image could not be loaded.";
        setProcessingControlsEnabled(false);
    };

    loadedImage.src = currentImageUrl;
});

grayscaleButton.addEventListener("click", () => {
    if (!originalImage) return;
    const imageData = getOriginalImageData();
    const gray = getGrayscalePixels(imageData);

    for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
        imageData.data[i] = gray[p];
        imageData.data[i + 1] = gray[p];
        imageData.data[i + 2] = gray[p];
    }

    displayImageData(imageData);
});

invertButton.addEventListener("click", () => {
    if (!originalImage) return;
    const imageData = getOriginalImageData();

    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255 - imageData.data[i];
        imageData.data[i + 1] = 255 - imageData.data[i + 1];
        imageData.data[i + 2] = 255 - imageData.data[i + 2];
    }

    displayImageData(imageData);
});

brightnessSlider.addEventListener("input", () => {
    brightnessValue.value = brightnessSlider.value;
    brightnessValue.textContent = brightnessSlider.value;
});

applyBrightnessButton.addEventListener("click", () => {
    if (!originalImage) return;
    const imageData = getOriginalImageData();
    const brightness = Number(brightnessSlider.value);

    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = clamp(imageData.data[i] + brightness);
        imageData.data[i + 1] = clamp(imageData.data[i + 1] + brightness);
        imageData.data[i + 2] = clamp(imageData.data[i + 2] + brightness);
    }

    displayImageData(imageData);
});

contrastSlider.addEventListener("input", () => {
    contrastValue.value = contrastSlider.value;
    contrastValue.textContent = contrastSlider.value;
});

applyContrastButton.addEventListener("click", () => {
    if (!originalImage) return;
    const imageData = getOriginalImageData();
    const contrast = Number(contrastSlider.value);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = clamp(factor * (imageData.data[i] - 128) + 128);
        imageData.data[i + 1] = clamp(factor * (imageData.data[i + 1] - 128) + 128);
        imageData.data[i + 2] = clamp(factor * (imageData.data[i + 2] - 128) + 128);
    }

    displayImageData(imageData);
});

stretchButton.addEventListener("click", () => {
    if (!originalImage) return;
    const imageData = getOriginalImageData();
    const gray = getGrayscalePixels(imageData);
    const minValue = Math.min(...gray);
    const maxValue = Math.max(...gray);

    if (maxValue === minValue) {
        displayImageData(imageData);
        return;
    }

    const range = maxValue - minValue;

    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = clamp((imageData.data[i] - minValue) * 255 / range);
        imageData.data[i + 1] = clamp((imageData.data[i + 1] - minValue) * 255 / range);
        imageData.data[i + 2] = clamp((imageData.data[i + 2] - minValue) * 255 / range);
    }

    displayImageData(imageData);
});

localMeanWindow.addEventListener("input", () => {
    localMeanWindowValue.value = localMeanWindow.value;
    localMeanWindowValue.textContent = localMeanWindow.value;
});

localMeanOffset.addEventListener("input", () => {
    localMeanOffsetValue.value = localMeanOffset.value;
    localMeanOffsetValue.textContent = localMeanOffset.value;
});

function getLocalStatistics(gray, width, height, windowSize) {
    const count = width * height;
    const squared = new Float64Array(count);

    for (let i = 0; i < count; i++) {
        squared[i] = gray[i] * gray[i];
    }

    return {
        sum: buildIntegralImage(gray, width, height),
        squaredSum: buildIntegralImage(squared, width, height),
        width,
        height,
        stride: width + 1,
        radius: Math.floor(windowSize / 2)
    };
}

function getWindowStatistics(stats, x, y) {
    const { width, height, stride, radius, sum, squaredSum } = stats;
    const x1 = Math.max(0, x - radius);
    const y1 = Math.max(0, y - radius);
    const x2 = Math.min(width, x + radius + 1);
    const y2 = Math.min(height, y + radius + 1);

    const area = (x2 - x1) * (y2 - y1);
    const localSum = rectangleSum(sum, stride, x1, y1, x2, y2);
    const localSquaredSum = rectangleSum(squaredSum, stride, x1, y1, x2, y2);
    const mean = localSum / area;
    const variance = Math.max(0, localSquaredSum / area - mean * mean);

    return { mean, standardDeviation: Math.sqrt(variance) };
}

localMeanButton.addEventListener("click", () => {
    if (!originalImage) return;

    const imageData = getOriginalImageData();
    const { width, height } = imageData;
    const gray = getGrayscalePixels(imageData);
    const stats = getLocalStatistics(
        gray, width, height, Number(localMeanWindow.value)
    );
    const offset = Number(localMeanOffset.value);

    const output = makeBinaryImage(gray, width, height, (x, y) => {
        return getWindowStatistics(stats, x, y).mean - offset;
    });

    displayImageData(output);
});

niblackK.addEventListener("input", () => {
    niblackKValue.value = Number(niblackK.value).toFixed(2);
    niblackKValue.textContent = Number(niblackK.value).toFixed(2);
});

niblackButton.addEventListener("click", () => {
    if (!originalImage) return;

    const imageData = getOriginalImageData();
    const { width, height } = imageData;
    const gray = getGrayscalePixels(imageData);
    const stats = getLocalStatistics(
        gray, width, height, Number(localMeanWindow.value)
    );
    const k = Number(niblackK.value);

    const output = makeBinaryImage(gray, width, height, (x, y) => {
        const local = getWindowStatistics(stats, x, y);
        return local.mean + k * local.standardDeviation;
    });

    displayImageData(output);
});

resetButton.addEventListener("click", () => {
    clearResult();
    brightnessSlider.value = "0";
    brightnessValue.value = "0";
    brightnessValue.textContent = "0";
    contrastSlider.value = "0";
    contrastValue.value = "0";
    contrastValue.textContent = "0";
});

window.addEventListener("beforeunload", () => {
    if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
});
