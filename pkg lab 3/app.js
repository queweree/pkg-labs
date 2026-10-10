"use strict";

const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const imagePreview = document.getElementById("imagePreview");
const imageInfo = document.getElementById("imageInfo");
const appStatus = document.getElementById("appStatus");

const grayscaleButton = document.getElementById("grayscaleButton");
const resetButton = document.getElementById("resetButton");
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
    resetButton.disabled = true;

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
        resetButton.disabled = false;

        setStatus("Image loaded");
    };

    previewImage.onerror = () => {
        resetPreview();
        setStatus("Could not load image", true);
    };

    previewImage.src = currentImageUrl;
}

function convertToGrayscale() {
    if (!previewImage.complete || previewImage.naturalWidth === 0) {
        setStatus("Please load an image first", true);
        return;
    }

    const width = previewImage.naturalWidth;
    const height = previewImage.naturalHeight;

    resultCanvas.width = width;
    resultCanvas.height = height;

    const context = resultCanvas.getContext("2d", {
        willReadFrequently: true
    });

    context.drawImage(previewImage, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];

        // Weighted luminance approximation.
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

    resultCanvas.hidden = false;
    resultPlaceholder.hidden = true;

    setStatus("Grayscale conversion complete");
}

function resetImage() {
    clearResult();
    setStatus("Image loaded");
}

imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        showImage(file);
    }
});

grayscaleButton.addEventListener("click", convertToGrayscale);
resetButton.addEventListener("click", resetImage);

window.addEventListener("beforeunload", () => {
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }
});