// Global state
let uploadedFiles = [];
let currentJobId = null;
let statusCheckInterval = null;

// DOM Elements
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const processBtn = document.getElementById("processBtn");
const progressSection = document.getElementById("progressSection");
const resultsSection = document.getElementById("resultsSection");
const statusText = document.getElementById("statusText");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");
const chunkProgress = document.getElementById("chunkProgress");
const currentFileEl = document.getElementById("currentFile");
const resultsList = document.getElementById("resultsList");

// Upload progress elements
const uploadProgress = document.getElementById("uploadProgress");
const uploadStatus = document.getElementById("uploadStatus");
const uploadPercent = document.getElementById("uploadPercent");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadDetails = document.getElementById("uploadDetails");

// Form Elements
const apiKeyInput = document.getElementById("apiKey");
const characterImageInput = document.getElementById("characterImage");
const imageUploadArea = document.getElementById("imageUploadArea");
const imagePreview = document.getElementById("imagePreview");
const previewImg = document.getElementById("previewImg");
const modeSelect = document.getElementById("mode");

// Character image state
let characterImageFile = null;

// Upload Area Events
uploadArea.addEventListener("click", () => fileInput.click());

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

// Character Image Upload Events
imageUploadArea.addEventListener("click", () => characterImageInput.click());

characterImageInput.addEventListener("change", (e) => {
  handleCharacterImage(e.target.files[0]);
});

imageUploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  imageUploadArea.classList.add("dragover");
});

imageUploadArea.addEventListener("dragleave", () => {
  imageUploadArea.classList.remove("dragover");
});

imageUploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  imageUploadArea.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleCharacterImage(e.dataTransfer.files[0]);
  }
});

// Handle character image selection
function handleCharacterImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please select a valid image file");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("Image file is too large. Maximum size is 10MB");
    return;
  }

  // Show upload progress for image
  uploadProgress.style.display = "block";
  uploadStatus.textContent = "Loading image...";
  uploadPercent.textContent = "0%";
  uploadProgressFill.style.width = "0%";
  uploadDetails.textContent = `Image size: ${(file.size / 1024 / 1024).toFixed(
    2
  )} MB`;

  characterImageFile = file;

  // Show preview with progress simulation
  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentComplete = (e.loaded / e.total) * 100;
      uploadPercent.textContent = `${Math.round(percentComplete)}%`;
      uploadProgressFill.style.width = `${percentComplete}%`;
    }
  };

  reader.onload = (e) => {
    previewImg.src = e.target.result;
    imageUploadArea.style.display = "none";
    imagePreview.style.display = "block";

    uploadPercent.textContent = "100%";
    uploadProgressFill.style.width = "100%";
    uploadStatus.textContent = "✓ Image loaded!";

    // Hide progress after delay
    setTimeout(() => {
      uploadProgress.style.display = "none";
    }, 1000);
  };

  reader.onerror = () => {
    alert("Failed to load image");
    uploadProgress.style.display = "none";
  };

  reader.readAsDataURL(file);
}

// Remove character image
function removeCharacterImage() {
  characterImageFile = null;
  characterImageInput.value = "";
  previewImg.src = "";
  imageUploadArea.style.display = "block";
  imagePreview.style.display = "none";
}

// Handle file selection
function handleFiles(files) {
  const videoFiles = Array.from(files).filter((file) =>
    file.type.startsWith("video/")
  );

  if (videoFiles.length === 0) {
    alert("Please select valid video files");
    return;
  }

  uploadFilesToServer(videoFiles);
}

// Upload files to server with progress
async function uploadFilesToServer(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("videos", file));

  // Calculate total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

  try {
    processBtn.disabled = true;
    processBtn.textContent = "Uploading...";

    // Show upload progress
    uploadProgress.style.display = "block";
    uploadStatus.textContent = `Uploading ${files.length} video(s)...`;
    uploadDetails.textContent = `Total size: ${totalSizeMB} MB`;
    uploadPercent.textContent = "0%";
    uploadProgressFill.style.width = "0%";

    // Create XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        uploadPercent.textContent = `${Math.round(percentComplete)}%`;
        uploadProgressFill.style.width = `${percentComplete}%`;

        const uploadedMB = (e.loaded / 1024 / 1024).toFixed(2);
        uploadDetails.textContent = `Uploaded: ${uploadedMB} MB / ${totalSizeMB} MB`;
      }
    });

    // Handle completion
    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          uploadedFiles = [...uploadedFiles, ...data.files];
          renderFileList();

          // Hide progress after success
          setTimeout(() => {
            uploadProgress.style.display = "none";
          }, 1000);

          processBtn.disabled = false;
          processBtn.textContent = "Start Processing";
        } else {
          alert("Upload failed: " + data.error);
          uploadProgress.style.display = "none";
          processBtn.disabled = uploadedFiles.length === 0;
          processBtn.textContent = "Start Processing";
        }
      } else {
        alert("Upload failed with status: " + xhr.status);
        uploadProgress.style.display = "none";
        processBtn.disabled = uploadedFiles.length === 0;
        processBtn.textContent = "Start Processing";
      }
    });

    // Handle errors
    xhr.addEventListener("error", () => {
      alert("Upload error: Network error");
      uploadProgress.style.display = "none";
      processBtn.disabled = uploadedFiles.length === 0;
      processBtn.textContent = "Start Processing";
    });

    // Send request
    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  } catch (error) {
    alert("Upload error: " + error.message);
    uploadProgress.style.display = "none";
    processBtn.disabled = uploadedFiles.length === 0;
    processBtn.textContent = "Start Processing";
  }
}

// Render file list
function renderFileList() {
  if (uploadedFiles.length === 0) {
    fileList.innerHTML = "";
    return;
  }

  fileList.innerHTML = uploadedFiles
    .map(
      (file, index) => `
    <div class="file-item">
      <div class="file-info">
        <div class="file-icon">🎬</div>
        <div class="file-details">
          <h4>${file.originalName}</h4>
          <small>${formatFileSize(file.size)}</small>
        </div>
      </div>
      <button class="file-remove" onclick="removeFile(${index})">×</button>
    </div>
  `
    )
    .join("");
}

// Remove file
function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
  processBtn.disabled = uploadedFiles.length === 0;
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// Process videos
processBtn.addEventListener("click", async () => {
  // Validate inputs
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    alert("Please enter your DashScope API key");
    apiKeyInput.focus();
    return;
  }

  if (!characterImageFile) {
    alert("Please upload a character image");
    return;
  }

  if (uploadedFiles.length === 0) {
    alert("Please upload at least one video");
    return;
  }

  try {
    processBtn.disabled = true;
    processBtn.textContent = "Uploading character image...";

    // Upload character image first
    const imageFormData = new FormData();
    imageFormData.append("characterImage", characterImageFile);

    const imageUploadResponse = await fetch("/api/upload-character-image", {
      method: "POST",
      body: imageFormData,
    });

    const imageData = await imageUploadResponse.json();

    if (!imageData.success) {
      alert("Failed to upload character image: " + imageData.error);
      processBtn.disabled = false;
      processBtn.textContent = "Start Processing";
      return;
    }

    processBtn.textContent = "Starting processing...";

    // Prepare payload
    const payload = {
      files: uploadedFiles,
      apiKey: apiKey,
      characterImagePath: imageData.imagePath,
      mode: modeSelect.value,
    };

    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.success) {
      currentJobId = data.jobId;
      progressSection.style.display = "block";
      startStatusPolling();
    } else {
      alert("Failed to start processing: " + data.error);
      processBtn.disabled = false;
      processBtn.textContent = "Start Processing";
    }
  } catch (error) {
    alert("Error: " + error.message);
    processBtn.disabled = false;
    processBtn.textContent = "Start Processing";
  }
});

// Poll job status
function startStatusPolling() {
  statusCheckInterval = setInterval(checkJobStatus, 2000);
  checkJobStatus(); // Check immediately
}

async function checkJobStatus() {
  if (!currentJobId) return;

  try {
    const response = await fetch(`/api/status/${currentJobId}`);
    const data = await response.json();

    if (data.success) {
      updateProgress(data.job);

      if (data.job.status === "completed" || data.job.status === "error") {
        clearInterval(statusCheckInterval);
        showResults(data.job);
      }
    }
  } catch (error) {
    console.error("Status check error:", error);
  }
}

// Update progress UI
function updateProgress(job) {
  statusText.textContent = job.status;
  progressPercent.textContent = `${Math.round(job.progress)}%`;
  progressFill.style.width = `${job.progress}%`;
  chunkProgress.textContent = `${job.processedChunks}/${job.totalChunks}`;
  currentFileEl.textContent = job.currentFile || "-";
}

// Show results
function showResults(job) {
  resultsSection.style.display = "block";

  resultsList.innerHTML = job.results
    .map(
      (result) => `
    <div class="result-item ${result.status === "error" ? "error" : ""}">
      <div class="result-info">
        <h4>${result.originalName}</h4>
        <span class="result-status ${result.status}">${result.status}</span>
        ${result.error ? `<p class="error-message">${result.error}</p>` : ""}
      </div>
      ${
        result.status === "completed"
          ? `
        <button class="btn btn-download" onclick="downloadVideo('${job.id}', '${result.fileId}', '${result.originalName}')">
          Download
        </button>
      `
          : ""
      }
    </div>
  `
    )
    .join("");

  processBtn.disabled = false;
  processBtn.textContent = "Process More Videos";
}

// Download video
function downloadVideo(jobId, fileId, filename) {
  const url = `/api/download/${jobId}/${fileId}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.[^/.]+$/, "") + "_animated.mp4";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Initialize
processBtn.disabled = true;
