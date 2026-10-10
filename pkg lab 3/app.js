"use strict";

const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const imagePreview = document.getElementById("imagePreview");
const imageInfo = document.getElementById("imageInfo");
const appStatus = document.getElementById("appStatus");

const grayscaleButton = document.getElementById("grayscaleButton");
const invertButton = document.getElementById("invertButton");
const resetButton = document.getElementById("resetButton");

const brightnessSlider = document.getElementById("brightnessSlider");
const brightnessValue = document.getElementById("brightnessValue");
const applyBrightnessButton = document.getElementById("applyBrightnessButton");

const resultCanvas = document.getElementById("resultCanvas");
const resultPlaceholder = document.getElementById("resultPlaceholder");

let currentImageUrl = null;

function setStatus(message, isError = false) {
    appStatus.textContent = message;

    const dot = document.querySelector(".status-dot");

    if (dot) {
        dot.style.background = isError ? "#ff8585" : "#63d6a3";
        dot.style.boxShadow = isError
            ? "0 0 12px rgba(255, 133, 133, 0.4)"
            : "0 0 12px rgba(99, 214, 163, 0.4)";
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function clearResult() {
    const context = resultCanvas.getContext("2d");

    context.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    resultCanvas.width = 0;
    resultCanvas.height = 0;
    resultCanvas.hidden = true;
    resultPlaceholder.hidden = false;
}

function resetPreview() {
    previewImage.onload = null;
    previewImage.onerror = null;
    previewImage.removeAttribute("src");
    previewImage.hidden = true;

    imagePreview.querySelector(".preview-empty").hidden = false;

    imageInfo.hidden = true;
    imageInfo.textContent = "";

    grayscaleButton.disabled = true;
    invertButton.disabled = true;
    resetButton.disabled = true;
    brightnessSlider.disabled = true;
    applyBrightnessButton.disabled = true;

    brightnessSlider.value = "0";
    brightnessValue.value = "0";
    brightnessValue.textContent = "0";

    clearResult();

    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
        currentImageUrl = null;
    }
}

function showImage(file) {
    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        setStatus("Unsupported file", true);
        imageInput.value = "";
        return;
    }

    resetPreview();

    currentImageUrl = URL.createObjectURL(file);

    previewImage.onload = () => {
        imagePreview.querySelector(".preview-empty").hidden = true;
        previewImage.hidden = false;

        imageInfo.textContent =
            `${file.name} · ${previewImage.naturalWidth} × ` +
            `${previewImage.naturalHeight} px · ${formatFileSize(file.size)}`;

        imageInfo.hidden = false;

        grayscaleButton.disabled = false;
        invertButton.disabled = false;
        resetButton.disabled = false;
        brightnessSlider.disabled = false;
        applyBrightnessButton.disabled = false;

        setStatus("Image loaded");
    };

    previewImage.onerror = () => {
        resetPreview();
        setStatus("Could not load image", true);
    };

    previewImage.src = currentImageUrl;
}

function prepareCanvas() {
    if (!previewImage.complete || previewImage.naturalWidth === 0) {
        setStatus("Please load an image first", true);
        return null;
    }

    const width = previewImage.naturalWidth;
    const height = previewImage.naturalHeight;

    resultCanvas.width = width;
    resultCanvas.height = height;

    const context = resultCanvas.getContext("2d", {
        willReadFrequently: true
    });

    context.drawImage(previewImage, 0, 0, width, height);

    return {
        context,
        imageData: context.getImageData(0, 0, width, height)
    };
}

function showResult(message) {
    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;
    setStatus(message);
}

function convertToGrayscale() {
    const prepared = prepareCanvas();

    if (!prepared) {
        return;
    }

    const { context, imageData } = prepared;
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];

        const gray = Math.round(
            0.299 * red +
            0.587 * green +
            0.114 * blue
        );

        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
    }

    context.putImageData(imageData, 0, 0);
    showResult("Grayscale conversion complete");
}

function invertColors() {
    const prepared = prepareCanvas();

    if (!prepared) {
        return;
    }

    const { context, imageData } = prepared;
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 255 - pixels[i];
        pixels[i + 1] = 255 - pixels[i + 1];
        pixels[i + 2] = 255 - pixels[i + 2];
    }

    context.putImageData(imageData, 0, 0);
    showResult("Color inversion complete");
}

function adjustBrightness() {
    const prepared = prepareCanvas();

    if (!prepared) {
        return;
    }

    const { context, imageData } = prepared;
    const pixels = imageData.data;
    const brightness = Number(brightnessSlider.value);

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp(pixels[i] + brightness);
        pixels[i + 1] = clamp(pixels[i + 1] + brightness);
        pixels[i + 2] = clamp(pixels[i + 2] + brightness);

        // Keep the original alpha channel unchanged.
    }

    context.putImageData(imageData, 0, 0);

    showResult(`Brightness adjusted: ${brightness}`);
}

function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function resetImage() {
    clearResult();
    brightnessSlider.value = "0";
    brightnessValue.value = "0";
    brightnessValue.textContent = "0";

    setStatus("Image loaded");
}

imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        showImage(file);
    }
});

brightnessSlider.addEventListener("input", () => {
    const value = Number(brightnessSlider.value);

    brightnessValue.value = String(value);
    brightnessValue.textContent = value > 0 ? `+${value}` : String(value);
});

grayscaleButton.addEventListener("click", convertToGrayscale);
invertButton.addEventListener("click", invertColors);
resetButton.addEventListener("click", resetImage);
applyBrightnessButton.addEventListener("click", adjustBrightness);

window.addEventListener("beforeunload", () => {
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }
});