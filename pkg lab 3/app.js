
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

const resultCanvas = document.getElementById("resultCanvas");
const resultPlaceholder = document.getElementById("resultPlaceholder");

const resultContext = resultCanvas.getContext("2d");

let originalImage = null;
let currentImageUrl = null;

function setProcessingControlsEnabled(enabled) {
    grayscaleButton.disabled = !enabled;
    invertButton.disabled = !enabled;
    resetButton.disabled = !enabled;

    brightnessSlider.disabled = !enabled;
    applyBrightnessButton.disabled = !enabled;

    contrastSlider.disabled = !enabled;
    applyContrastButton.disabled = !enabled;

    stretchButton.disabled = !enabled;

    localMeanWindow.disabled = !enabled;
    localMeanOffset.disabled = !enabled;
    localMeanButton.disabled = !enabled;
}

function clearResult() {
    resultContext.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCanvas.hidden = true;
    resultPlaceholder.hidden = false;
}

function getOriginalImageData() {
    const temporaryCanvas = document.createElement("canvas");
    temporaryCanvas.width = originalImage.naturalWidth;
    temporaryCanvas.height = originalImage.naturalHeight;

    const temporaryContext = temporaryCanvas.getContext("2d");
    temporaryContext.drawImage(originalImage, 0, 0);

    return temporaryContext.getImageData(
        0,
        0,
        temporaryCanvas.width,
        temporaryCanvas.height
    );
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

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        imageInfo.textContent = "Please select a valid image file.";
        imageInput.value = "";
        return;
    }

    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }

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
    if (!originalImage) {
        return;
    }

    const imageData = getOriginalImageData();
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const gray = Math.round(
            0.299 * pixels[i] +
            0.587 * pixels[i + 1] +
            0.114 * pixels[i + 2]
        );

        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
    }

    displayImageData(imageData);
});

invertButton.addEventListener("click", () => {
    if (!originalImage) {
        return;
    }

    const imageData = getOriginalImageData();
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 255 - pixels[i];
        pixels[i + 1] = 255 - pixels[i + 1];
        pixels[i + 2] = 255 - pixels[i + 2];
    }

    displayImageData(imageData);
});

brightnessSlider.addEventListener("input", () => {
    brightnessValue.value = brightnessSlider.value;
    brightnessValue.textContent = brightnessSlider.value;
});

applyBrightnessButton.addEventListener("click", () => {
    if (!originalImage) {
        return;
    }

    const brightness = Number(brightnessSlider.value);
    const imageData = getOriginalImageData();
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp(pixels[i] + brightness);
        pixels[i + 1] = clamp(pixels[i + 1] + brightness);
        pixels[i + 2] = clamp(pixels[i + 2] + brightness);
    }

    displayImageData(imageData);
});

contrastSlider.addEventListener("input", () => {
    contrastValue.value = contrastSlider.value;
    contrastValue.textContent = contrastSlider.value;
});

applyContrastButton.addEventListener("click", () => {
    if (!originalImage) {
        return;
    }

    const contrast = Number(contrastSlider.value);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    const imageData = getOriginalImageData();
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp(factor * (pixels[i] - 128) + 128);
        pixels[i + 1] = clamp(factor * (pixels[i + 1] - 128) + 128);
        pixels[i + 2] = clamp(factor * (pixels[i + 2] - 128) + 128);
    }

    displayImageData(imageData);
});

stretchButton.addEventListener("click", () => {
    if (!originalImage) {
        return;
    }

    const imageData = getOriginalImageData();
    const pixels = imageData.data;

    let minIntensity = 255;
    let maxIntensity = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const intensity = Math.round(
            0.299 * pixels[i] +
            0.587 * pixels[i + 1] +
            0.114 * pixels[i + 2]
        );

        minIntensity = Math.min(minIntensity, intensity);
        maxIntensity = Math.max(maxIntensity, intensity);
    }

    if (maxIntensity === minIntensity) {
        displayImageData(imageData);
        return;
    }

    const intensityRange = maxIntensity - minIntensity;

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp(
            ((pixels[i] - minIntensity) * 255) / intensityRange
        );
        pixels[i + 1] = clamp(
            ((pixels[i + 1] - minIntensity) * 255) / intensityRange
        );
        pixels[i + 2] = clamp(
            ((pixels[i + 2] - minIntensity) * 255) / intensityRange
        );
    }

    displayImageData(imageData);
});

// Build an integral image for fast local neighborhood sums.
function buildIntegralImage(gray, width, height) {
    const stride = width + 1;
    const integral = new Float64Array((width + 1) * (height + 1));

    for (let y = 1; y <= height; y++) {
        let rowSum = 0;

        for (let x = 1; x <= width; x++) {
            rowSum += gray[(y - 1) * width + (x - 1)];

            integral[y * stride + x] =
                integral[(y - 1) * stride + x] + rowSum;
        }
    }

    return integral;
}

// Return the sum of a rectangle using four integral-image values.
// Rectangle bounds are half-open: [x1, x2) × [y1, y2).
function rectangleSum(integral, stride, x1, y1, x2, y2) {
    return (
        integral[y2 * stride + x2] -
        integral[y1 * stride + x2] -
        integral[y2 * stride + x1] +
        integral[y1 * stride + x1]
    );
}

localMeanWindow.addEventListener("input", () => {
    localMeanWindowValue.value = localMeanWindow.value;
    localMeanWindowValue.textContent = localMeanWindow.value;
});

localMeanOffset.addEventListener("input", () => {
    localMeanOffsetValue.value = localMeanOffset.value;
    localMeanOffsetValue.textContent = localMeanOffset.value;
});

localMeanButton.addEventListener("click", () => {
    if (!originalImage) {
        return;
    }

    const imageData = getOriginalImageData();
    const { width, height, data } = imageData;
    const pixelCount = width * height;

    const gray = new Uint8Array(pixelCount);

    // Convert RGB to grayscale first.
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = Math.round(
            0.299 * data[i] +
            0.587 * data[i + 1] +
            0.114 * data[i + 2]
        );
    }

    const integral = buildIntegralImage(gray, width, height);
    const stride = width + 1;
    const radius = Math.floor(Number(localMeanWindow.value) / 2);
    const offset = Number(localMeanOffset.value);

    const output = new ImageData(width, height);
    const outputPixels = output.data;

    for (let y = 0; y < height; y++) {
        const y1 = Math.max(0, y - radius);
        const y2 = Math.min(height, y + radius + 1);

        for (let x = 0; x < width; x++) {
            const x1 = Math.max(0, x - radius);
            const x2 = Math.min(width, x + radius + 1);

            const sum = rectangleSum(
                integral,
                stride,
                x1,
                y1,
                x2,
                y2
            );

            const area = (x2 - x1) * (y2 - y1);
            const localMean = sum / area;
            const threshold = localMean - offset;

            const value = gray[y * width + x] > threshold ? 255 : 0;
            const index = (y * width + x) * 4;

            outputPixels[index] = value;
            outputPixels[index + 1] = value;
            outputPixels[index + 2] = value;
            outputPixels[index + 3] = 255;
        }
    }

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
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }
});
