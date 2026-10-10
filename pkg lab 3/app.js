"use strict";

const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const imagePreview = document.getElementById("imagePreview");
const imageInfo = document.getElementById("imageInfo");
const appStatus = document.getElementById("appStatus");

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

function resetPreview() {
    previewImage.removeAttribute("src");
    previewImage.hidden = true;
    imagePreview.querySelector(".preview-empty").hidden = false;
    imageInfo.hidden = true;
    imageInfo.textContent = "";

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
        setStatus("Image loaded");
    };

    previewImage.onerror = () => {
        resetPreview();
        setStatus("Could not load image", true);
    };

    previewImage.src = currentImageUrl;
}

imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        showImage(file);
    }
});

window.addEventListener("beforeunload", () => {
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }
});