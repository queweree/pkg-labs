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
}

function clearResult() {
    resultContext.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCanvas.hidden = true;
    resultPlaceholder.hidden = false;
}

function drawOriginalToCanvas() {
    if (!originalImage) {
        return;
    }

    resultCanvas.width = originalImage.naturalWidth;
    resultCanvas.height = originalImage.naturalHeight;

    resultContext.drawImage(
        originalImage,
        0,
        0,
        resultCanvas.width,
        resultCanvas.height
    );

    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
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

function showImageInfo(file, image) {
    const sizeInKB = (file.size / 1024).toFixed(1);

    imageInfo.textContent =
        `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px · ${sizeInKB} KB`;
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

    resultCanvas.width = imageData.width;
    resultCanvas.height = imageData.height;
    resultContext.putImageData(imageData, 0, 0);

    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
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

    resultCanvas.width = imageData.width;
    resultCanvas.height = imageData.height;
    resultContext.putImageData(imageData, 0, 0);

    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
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

    resultCanvas.width = imageData.width;
    resultCanvas.height = imageData.height;
    resultContext.putImageData(imageData, 0, 0);

    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
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

    // Map the slider value to a contrast factor.
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    const imageData = getOriginalImageData();
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp(factor * (pixels[i] - 128) + 128);
        pixels[i + 1] = clamp(factor * (pixels[i + 1] - 128) + 128);
        pixels[i + 2] = clamp(factor * (pixels[i + 2] - 128) + 128);
    }

    resultCanvas.width = imageData.width;
    resultCanvas.height = imageData.height;
    resultContext.putImageData(imageData, 0, 0);

    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
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

function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

window.addEventListener("beforeunload", () => {
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }
});