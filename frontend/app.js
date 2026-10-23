/* ============================================================
   FaceGuard Pro — Dashboard JavaScript
   Handles: API calls, WebSocket, navigation, CRUD, toasts
   ============================================================ */

const API = window.location.origin;
const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

let ws = null;
let wsReconnectTimer = null;
let currentLogsPage = 1;
let allUsers = [];
let enrollmentUser = null;
let enrollmentSamples = 0;
let enrollmentStream = null;
let recognitionStream = null;
let isCapturingDataset = false;
let enrollmentDetectionTimer = null;
let enrollmentDetectionInFlight = false;

// ── Clock ─────────────────────────────────────────────────────────

function updateClock() {
  document.getElementById("topbar-time").textContent =
    new Date().toLocaleTimeString("en-US", { hour12: false });
}
updateClock();
setInterval(updateClock, 1000);

// ── Navigation ────────────────────────────────────────────────────

const SECTIONS = {
  dashboard: { title: "Dashboard",       subtitle: "Real-time system overview" },
  users:     { title: "Users",           subtitle: "Manage registered identities" },
  logs:      { title: "Attendance Logs", subtitle: "Full recognition event history" },
  register:  { title: "Register Face",   subtitle: "Enroll a new user in the system" },
  system:    { title: "System",          subtitle: "Service health & API reference" },
};

function showSection(name) {
  // Update nav
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  const navBtn = document.getElementById(`nav-${name}`);
  if (navBtn) navBtn.classList.add("active");

  // Swap section visibility
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(`section-${name}`)?.classList.remove("hidden");

  // Update topbar
  const meta = SECTIONS[name] || {};
  document.getElementById("page-title").textContent    = meta.title    || name;
  document.getElementById("page-subtitle").textContent = meta.subtitle || "";

  // Load data lazily
  if (name === "dashboard") loadDashboard();
  if (name === "users")     loadUsers();
  if (name === "logs")      loadLogs();
  if (name === "system")    checkHealth();
}

// ── WebSocket ─────────────────────────────────────────────────────

function connectWS() {
  if (ws) ws.close();
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    clearTimeout(wsReconnectTimer);
    setWsStatus(true);
    updateHealthBadge("health-ws", "ok", "Connected");
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "connected") return;
      appendFeedItem(data);
    } catch { /* ignore malformed */ }
  };

  ws.onclose = () => {
    setWsStatus(false);
    updateHealthBadge("health-ws", "error", "Disconnected");
    wsReconnectTimer = setTimeout(connectWS, 4000);
  };

  ws.onerror = () => {
    updateHealthBadge("health-ws", "error", "Error");
  };
}

function setWsStatus(connected) {
  const dot   = document.getElementById("ws-dot");
  const label = document.getElementById("ws-label");
  dot.className   = "status-dot " + (connected ? "connected" : "disconnected");
  label.textContent = connected ? "WebSocket live" : "Reconnecting…";
}

// ── Live Feed ─────────────────────────────────────────────────────

function appendFeedItem(data) {
  const feed = document.getElementById("live-feed");
  if (!feed) return;

  // Remove placeholder
  const ph = feed.querySelector(".feed-placeholder");
  if (ph) ph.remove();

  const isKnown = data.userId != null || (data.label && !data.label.startsWith("Unknown"));
  const conf    = typeof data.confidence === "number" ? data.confidence.toFixed(1) : "--";
  const name    = data.label || (isKnown ? "Known" : "Unknown");
  const time    = new Date().toLocaleTimeString("en-US", { hour12: false });

  const item = document.createElement("div");
  item.className = "feed-item";
  item.innerHTML = `
    <div class="feed-dot ${isKnown ? "known" : "unknown"}"></div>
    <span class="feed-name">${escHtml(name)}</span>
    <span class="feed-conf">${conf}%</span>
    <span class="feed-time">${time}</span>
  `;

  // Prepend (newest first) and cap at 80 items
  feed.prepend(item);
  while (feed.children.length > 80) {
    feed.removeChild(feed.lastChild);
  }

  // Refresh stats quietly
  loadStats();
}

function clearFeed() {
  const feed = document.getElementById("live-feed");
  feed.innerHTML = `
    <div class="feed-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14"/><rect x="1" y="6" width="14" height="12" rx="2"/></svg>
      <p>Feed cleared</p>
    </div>`;
}

// ── Stats / Dashboard ─────────────────────────────────────────────

async function loadStats() {
  try {
    const data = await apiFetch("/api/recognition/stats");
    const d = data.data;
    setEl("stat-total-users",  d.totalUsers);
    setEl("stat-known-today",  d.knownLogsToday);
    setEl("stat-unknown-today",d.unknownLogsToday);
    setEl("stat-total-today",  d.totalLogsToday);

    // Populate recent table
    const tbody = document.getElementById("recent-tbody");
    if (!d.recentLogs || d.recentLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No events yet today</td></tr>`;
      return;
    }
    tbody.innerHTML = d.recentLogs.map(row => {
      const conf = row.confidence.toFixed(1);
      const confClass = row.confidence >= 80 ? "high" : row.confidence >= 60 ? "medium" : "low";
      const isKnown = row.userId != null;
      const timeStr = new Date(row.recognisedAt).toLocaleTimeString();
      return `<tr>
        <td>${escHtml(row.user?.name || "Unknown")}</td>
        <td>
          <div class="conf-bar">
            <div class="conf-bar-track"><div class="conf-bar-fill ${confClass}" style="width:${conf}%"></div></div>
            <span class="conf-bar-label">${conf}%</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-secondary)">${timeStr}</td>
        <td><span class="badge ${isKnown ? "badge-green" : "badge-red"}">${isKnown ? "Identified" : "Unknown"}</span></td>
      </tr>`;
    }).join("");
  } catch {
    // silently ignore when backend is down
  }
}

async function loadDashboard() {
  await loadStats();
}

// ── Users ─────────────────────────────────────────────────────────

async function loadUsers() {
  try {
    const data = await apiFetch("/api/users");
    allUsers = data.data || [];
    renderUsers(allUsers);
  } catch (err) {
    document.getElementById("users-tbody").innerHTML =
      `<tr><td colspan="7" class="empty-row">⚠️ Cannot reach backend — ${err.message}</td></tr>`;
  }
}

function renderUsers(users) {
  const tbody = document.getElementById("users-tbody");
  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No users registered yet</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const date = new Date(u.createdAt).toLocaleDateString();
    const statusBadge = u.isActive
      ? `<span class="badge badge-green">Active</span>`
      : `<span class="badge badge-gray">Inactive</span>`;
    return `<tr>
      <td style="font-family:var(--font-mono);color:var(--text-muted)">#${u.id}</td>
      <td><strong>${escHtml(u.name)}</strong></td>
      <td>${u.age}</td>
      <td>${escHtml(u.department || "—")}</td>
      <td>${statusBadge}</td>
      <td style="font-size:0.8rem;color:var(--text-secondary)">${date}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-deactivate-id="${u.id}" data-user-name="${escHtml(u.name)}">Deactivate</button>
      </td>
    </tr>`;
  }).join("");
}

function filterUsers() {
  const q = document.getElementById("user-search").value.toLowerCase();
  renderUsers(allUsers.filter(u =>
    u.name.toLowerCase().includes(q) ||
    (u.department || "").toLowerCase().includes(q)
  ));
}

function deactivateUser(id, name) {
  openModal(
    "Deactivate User",
    `Are you sure you want to deactivate <strong>${escHtml(name)}</strong>? They will no longer be identified by the system.`,
    async () => {
      try {
        await apiFetch(`/api/users/${id}`, { method: "DELETE" });
        showToast(`${name} has been deactivated`, "success");
        closeModal();
        loadUsers();
        loadStats();
      } catch (err) {
        showToast("Failed to deactivate user: " + err.message, "error");
      }
    }
  );
}

// ── Logs ──────────────────────────────────────────────────────────

async function loadLogs(page = 1) {
  currentLogsPage = page;
  const limit = document.getElementById("log-limit")?.value || 50;
  try {
    const data = await apiFetch(`/api/recognition/logs?page=${page}&limit=${limit}`);
    const rows = data.data || [];
    const tbody = document.getElementById("logs-tbody");

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No recognition events logged yet</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((log, i) => {
      const conf      = log.confidence.toFixed(1);
      const confClass = log.confidence >= 80 ? "high" : log.confidence >= 60 ? "medium" : "low";
      const liveness  = log.isLive
        ? `<span class="badge badge-green">Live</span>`
        : `<span class="badge badge-red">Spoofed</span>`;
      const time = new Date(log.recognisedAt).toLocaleString();

      return `<tr>
        <td style="font-family:var(--font-mono);color:var(--text-muted)">${(page-1)*limit + i + 1}</td>
        <td><strong>${escHtml(log.label)}</strong></td>
        <td>
          <div class="conf-bar">
            <div class="conf-bar-track"><div class="conf-bar-fill ${confClass}" style="width:${conf}%"></div></div>
            <span class="conf-bar-label">${conf}%</span>
          </div>
        </td>
        <td>${liveness}</td>
        <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted)">${escHtml(log.cameraId)}</td>
        <td style="font-size:0.8rem;color:var(--text-secondary)">${time}</td>
      </tr>`;
    }).join("");

    // Pagination
    const total = data.total || 0;
    const pages = data.pages || 1;
    renderPagination(page, pages, total, limit);
  } catch (err) {
    document.getElementById("logs-tbody").innerHTML =
      `<tr><td colspan="6" class="empty-row">⚠️ ${err.message}</td></tr>`;
  }
}

function renderPagination(page, pages, total, limit) {
  const pg = document.getElementById("logs-pagination");
  if (!pg) return;
  if (pages <= 1) { pg.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted)">${total} records</span>`; return; }

  let html = `<span style="font-size:0.8rem;color:var(--text-muted);margin-right:8px">${total} records</span>`;
  if (page > 1)  html += `<button class="btn btn-ghost btn-sm" data-page="${page-1}">← Prev</button>`;
  html += `<span style="font-size:0.8rem;color:var(--text-secondary);padding:0 12px">Page ${page} / ${pages}</span>`;
  if (page < pages) html += `<button class="btn btn-ghost btn-sm" data-page="${page+1}">Next →</button>`;
  pg.innerHTML = html;
}

// ── Register User ─────────────────────────────────────────────────

async function registerUser(e) {
  e.preventDefault();
  const btn    = document.getElementById("reg-submit");
  const result = document.getElementById("reg-result");
  const name    = document.getElementById("reg-name").value.trim();
  const age     = parseInt(document.getElementById("reg-age").value, 10);
  const dept    = document.getElementById("reg-dept").value.trim();
  const address = document.getElementById("reg-address").value.trim();

  btn.disabled = true;
  btn.textContent = "Registering…";
  result.className = "form-result hidden";

  try {
    const data = await apiFetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ name, age, address, department: dept || undefined }),
    });
    const user = data.data;
    enrollmentUser = user;
    enrollmentSamples = 0;
    document.getElementById("enrollment-camera-button").disabled = false;
    document.getElementById("capture-dataset-button").disabled = !enrollmentStream;
    result.className = "form-result success";
    result.innerHTML = `
      <strong>${escHtml(user.name)}</strong> registered successfully.<br/>
      <span style="font-family:var(--font-mono);font-size:0.8rem">User ID: <strong>#${user.id}</strong></span><br/>
      <small style="color:var(--text-muted)">Capture face samples in the panel, then train the model.</small>
    `;
    await loadFaceStatus(user.id);
    document.getElementById("register-form").reset();
    showToast(`${user.name} registered (ID: ${user.id})`, "success");
  } catch (err) {
    result.className = "form-result error";
    result.textContent = "❌ " + err.message;
    showToast("Registration failed", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      Register User`;
  }
}

const frameAsJpeg = (video, canvas, quality = 0.82, maxWidth = 0) => {
  if (!video.videoWidth || !video.videoHeight) throw new Error("Camera is not ready yet");
  const scale = maxWidth > 0 && video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
};

function clearEnrollmentOverlay() {
  const overlay = document.getElementById("enrollment-overlay");
  if (!overlay) return;
  overlay.width = overlay.clientWidth;
  overlay.height = overlay.clientHeight;
  overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
}

function drawEnrollmentFaces(faces, sourceWidth, sourceHeight) {
  const overlay = document.getElementById("enrollment-overlay");
  if (!overlay) return;
  const width = overlay.clientWidth;
  const height = overlay.clientHeight;
  overlay.width = width;
  overlay.height = height;
  const context = overlay.getContext("2d");
  context.clearRect(0, 0, width, height);
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2;
  const offsetY = (height - sourceHeight * scale) / 2;
  context.strokeStyle = "#39d98a";
  context.lineWidth = 3;
  faces.forEach(({ x, y, w, h }) => {
    context.strokeRect(
      offsetX + x * scale,
      offsetY + y * scale,
      w * scale,
      h * scale
    );
  });
}

function drawRecognitionFaces(faces, sourceWidth, sourceHeight) {
  const overlay = document.getElementById("recognition-overlay");
  if (!overlay) return;
  const width = overlay.clientWidth;
  const height = overlay.clientHeight;
  overlay.width = width;
  overlay.height = height;
  const context = overlay.getContext("2d");
  context.clearRect(0, 0, width, height);
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2;
  const offsetY = (height - sourceHeight * scale) / 2;
  faces.forEach((face) => {
    const recognized = face.user != null;
    const color = recognized ? "#39d98a" : "#ff5c5c";
    const label = recognized ? face.user.name : "Unknown";
    const x = offsetX + face.bbox.x * scale;
    const y = offsetY + face.bbox.y * scale;
    const boxWidth = face.bbox.w * scale;
    const boxHeight = face.bbox.h * scale;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 3;
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.font = "600 14px sans-serif";
    const textWidth = context.measureText(label).width;
    context.fillRect(x, Math.max(0, y - 24), textWidth + 16, 24);
    context.fillStyle = "#101619";
    context.fillText(label, x + 8, Math.max(16, y - 7));
  });
}

async function detectEnrollmentFace() {
  if (!enrollmentStream || enrollmentDetectionInFlight) return;
  enrollmentDetectionInFlight = true;
  try {
    const image = frameAsJpeg(
      document.getElementById("enrollment-video"),
      document.getElementById("enrollment-canvas"),
      0.6,
      480
    );
    const response = await apiFetch("/api/faces/detect", {
      method: "POST",
      body: JSON.stringify({ image }),
    });
    drawEnrollmentFaces(response.data.faces, response.data.width, response.data.height);
  } catch {
    clearEnrollmentOverlay();
  } finally {
    enrollmentDetectionInFlight = false;
    if (enrollmentStream) enrollmentDetectionTimer = setTimeout(detectEnrollmentFace, 250);
  }
}

async function startEnrollmentCamera() {
  if (enrollmentStream) {
    enrollmentStream.getTracks().forEach(track => track.stop());
    enrollmentStream = null;
    clearTimeout(enrollmentDetectionTimer);
    enrollmentDetectionTimer = null;
    clearEnrollmentOverlay();
    document.getElementById("enrollment-video").srcObject = null;
    document.getElementById("enrollment-placeholder").classList.remove("hidden");
    document.getElementById("capture-dataset-button").disabled = true;
    document.getElementById("enrollment-camera-button").textContent = "Start camera";
    document.getElementById("capture-status").textContent = enrollmentUser
      ? "Camera stopped. Start it again to capture samples."
      : "Camera stopped.";
    return;
  }
  try {
    enrollmentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    const video = document.getElementById("enrollment-video");
    video.srcObject = enrollmentStream;
    await video.play();
    document.getElementById("enrollment-placeholder").classList.add("hidden");
    document.getElementById("enrollment-camera-button").textContent = "Stop camera";
    document.getElementById("capture-dataset-button").disabled = !enrollmentUser || enrollmentSamples >= 100;
    detectEnrollmentFace();
    document.getElementById("capture-status").textContent = enrollmentUser
      ? enrollmentSamples >= 100
        ? "Dataset complete with 100 samples. Select Train Model when ready."
        : "Camera ready. Keep your face centered while samples are captured."
      : "Camera preview ready. Register a user before capturing samples.";
  } catch (error) {
    showToast(error.message || "Camera access was denied", "error");
  }
}

async function captureDataset() {
  if (!enrollmentUser || !enrollmentStream || isCapturingDataset) return;
  if (enrollmentSamples >= 100) {
    document.getElementById("capture-status").textContent = "Dataset already has 100 samples. Select Train Model when ready.";
    return;
  }
  isCapturingDataset = true;
  const button = document.getElementById("capture-dataset-button");
  const progress = document.querySelector(".capture-progress");
  const progressBar = document.getElementById("capture-progress-bar");
  const status = document.getElementById("capture-status");
  const video = document.getElementById("enrollment-video");
  const canvas = document.getElementById("enrollment-canvas");
  let captured = 0;
  let attempts = 0;
  button.disabled = true;
  button.textContent = "Capturing…";

  try {
    while (captured < 100 && attempts < 300) {
      const batch = [];
      const batchSize = Math.min(10, 100 - captured);
      for (let index = 0; index < batchSize && attempts < 300; index += 1) {
        batch.push(frameAsJpeg(video, canvas, 0.62, 480));
        attempts += 1;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      try {
        const data = await apiFetch("/api/faces/capture/batch", {
          method: "POST",
          body: JSON.stringify({ userId: enrollmentUser.id, images: batch }),
        });
        captured = data.data.count;
        progress.setAttribute("aria-valuenow", captured);
        progressBar.style.width = `${captured}%`;
        status.textContent = `Captured ${captured} of 100 face samples${data.data.rejected ? ` · ${data.data.rejected} frames skipped` : ""}.`;
      } catch (error) {
        if (error.status !== 422) throw error;
        status.textContent = "No face found. Center your face in the frame…";
      }
    }
    if (captured < 100) throw new Error("Capture stopped before 100 samples. Check the camera framing and try again.");
    status.textContent = "Dataset complete. Select Train Model when ready.";
    showToast("100 face samples captured", "success");
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    isCapturingDataset = false;
    button.disabled = false;
    button.textContent = "Capture 100 samples";
    loadFaceStatus(enrollmentUser?.id);
  }
}

async function startRecognitionCamera() {
  try {
    recognitionStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    const video = document.getElementById("recognition-video");
    video.srcObject = recognitionStream;
    await video.play();
    document.getElementById("recognition-placeholder").classList.add("hidden");
    document.getElementById("recognize-button").disabled = false;
    document.getElementById("recognition-camera-button").textContent = "Stop camera";
    document.getElementById("recognition-camera-button").textContent = "Stop camera";
  } catch (error) {
    showToast(error.message || "Camera access was denied", "error");
  }
}

function stopRecognitionCamera() {
  recognitionStream?.getTracks().forEach(track => track.stop());
  recognitionStream = null;
  const overlay = document.getElementById("recognition-overlay");
  if (overlay) {
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;
    overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
  }
  document.getElementById("recognition-video").srcObject = null;
  document.getElementById("recognition-placeholder").classList.remove("hidden");
  document.getElementById("recognize-button").disabled = true;
  document.getElementById("recognition-camera-button").textContent = "Start camera";
  document.getElementById("recognition-camera-button").textContent = "Start camera";
}

function toggleRecognitionCamera() {
  if (recognitionStream) stopRecognitionCamera();
  else startRecognitionCamera();
}

async function recognizeCurrentFrame() {
  const button = document.getElementById("recognize-button");
  const result = document.getElementById("recognition-result");
  button.disabled = true;
  result.textContent = "Recognizing…";
  try {
    const data = await apiFetch("/api/faces/recognize", {
      method: "POST",
      body: JSON.stringify({ image: frameAsJpeg(
        document.getElementById("recognition-video"),
        document.getElementById("recognition-canvas")
      ) }),
    });
    drawRecognitionFaces(
      data.faces,
      document.getElementById("recognition-canvas").width,
      document.getElementById("recognition-canvas").height
    );
    if (!data.faces.length) {
      result.textContent = "No face detected. Face the camera and try again.";
      return;
    }
    result.innerHTML = data.faces.map(face => `
      <div class="recognition-match">
        <strong>${escHtml(face.user?.name || "Unknown")}</strong>
        <span>${Number(face.confidence).toFixed(0)}% match</span>
      </div>
    `).join("");
    loadStats();
  } catch (error) {
    result.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    button.disabled = !recognitionStream;
  }
}

async function trainFaceModel() {
  const button = document.getElementById("train-model-button");
  button.disabled = true;
  button.textContent = "Training…";
  try {
    const data = await apiFetch("/api/faces/train", {
      method: "POST",
      body: JSON.stringify(enrollmentUser ? { userId: enrollmentUser.id } : {}),
    });
    const trainingMessage = data.data.incremental
      ? data.data.samples_trained > 0
        ? `Added ${data.data.samples_trained} samples for ${data.data.users_trained} new users`
        : "The classifier already includes all captured users"
      : `Trained on ${data.data.samples_trained} samples from ${data.data.users_trained} users`;
    showToast(trainingMessage, "success");
    await loadFaceStatus();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Train Model";
  }
}

async function loadFaceStatus(userId = enrollmentUser?.id) {
  try {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const response = await apiFetch(`/api/faces/status${query}`);
    const status = response.data;
    const captureStatus = document.getElementById("capture-status");
    if (userId && enrollmentUser?.id === userId && status.samplesForUser != null) {
      enrollmentSamples = status.samplesForUser;
      document.getElementById("capture-dataset-button").disabled = !enrollmentStream || enrollmentSamples >= 100;
      if (!isCapturingDataset) {
        captureStatus.textContent = enrollmentSamples >= 100
          ? "Dataset complete with 100 samples. Select Train Model when ready."
          : `${enrollmentSamples} of 100 samples saved. ${enrollmentStream ? "Capture more samples when ready." : "Start the camera to continue."}`;
      }
    } else if (!isCapturingDataset && !enrollmentUser) {
      captureStatus.textContent = `${status.sampleCount} samples · ${status.usersWithSamples} users · ${status.storage}`;
    }
    return status;
  } catch {
    return null;
  }
}

// ── System Health ─────────────────────────────────────────────────

async function checkHealth() {
  // Backend
  try {
    const data = await apiFetch("/api/health");
    updateHealthBadge("health-backend", "ok", "Online");
    updateHealthBadge("health-db", data.database === "ok" ? "ok" : "error",
      data.database === "ok" ? "Connected" : "Unreachable");
  } catch {
    updateHealthBadge("health-backend", "error", "Offline");
    updateHealthBadge("health-db",      "error", "Unknown");
  }

  // Face-recognition service
  try {
    const response = await apiFetch("/api/faces/status");
    const status = response.data;
    updateHealthBadge("health-cv", status.service ? (status.modelTrained ? "ok" : "warning") : "error",
      status.service ? (status.modelTrained ? "Model ready" : "Train required") : "Offline");
  } catch {
    updateHealthBadge("health-cv", "error", "Offline");
  }

  // WS
  const wsOk = ws && ws.readyState === WebSocket.OPEN;
  updateHealthBadge("health-ws", wsOk ? "ok" : "error", wsOk ? "Connected" : "Disconnected");
}

function updateHealthBadge(id, cls, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `health-badge ${cls}`;
  el.textContent = text;
}

// ── Modal ─────────────────────────────────────────────────────────

let _onModalConfirm = null;

function openModal(title, body, onConfirm) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML    = body;
  document.getElementById("modal-overlay").classList.remove("hidden");
  _onModalConfirm = onConfirm;
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  _onModalConfirm = null;
}

// ── Toast Notifications ───────────────────────────────────────────

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const icon      = type === "success" ? "✅" : "❌";
  const toast     = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 320);
  }, 3500);
}

// ── API Fetch Helper ──────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.message || json.detail || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

// ── Utilities ─────────────────────────────────────────────────────

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? "--";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function refreshAll() {
  const active = document.querySelector(".nav-item.active")?.id?.replace("nav-", "");
  if (active) showSection(active);
  else        loadDashboard();
}

// ── Init ──────────────────────────────────────────────────────────

document.querySelectorAll("[data-section]").forEach(button => {
  button.addEventListener("click", () => showSection(button.dataset.section));
});
document.getElementById("refresh-button").addEventListener("click", refreshAll);
document.getElementById("train-model-button").addEventListener("click", trainFaceModel);
document.getElementById("recognition-camera-button").addEventListener("click", toggleRecognitionCamera);
document.getElementById("recognize-button").addEventListener("click", recognizeCurrentFrame);
document.getElementById("register-form").addEventListener("submit", registerUser);
document.getElementById("enrollment-camera-button").addEventListener("click", startEnrollmentCamera);
document.getElementById("capture-dataset-button").addEventListener("click", captureDataset);
document.getElementById("user-search").addEventListener("input", filterUsers);
document.getElementById("log-limit").addEventListener("change", () => loadLogs());
document.getElementById("refresh-logs-button").addEventListener("click", () => loadLogs());
document.getElementById("check-health-button").addEventListener("click", checkHealth);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-confirm").addEventListener("click", async () => {
  if (_onModalConfirm) await _onModalConfirm();
});
document.getElementById("users-tbody").addEventListener("click", event => {
  const button = event.target.closest("[data-deactivate-id]");
  if (button) deactivateUser(Number(button.dataset.deactivateId), button.dataset.userName);
});
document.getElementById("logs-pagination").addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) loadLogs(Number(button.dataset.page));
});

connectWS();
showSection("dashboard");

// Auto-refresh logs if on that section
setInterval(() => {
  const logsVisible = !document.getElementById("section-logs").classList.contains("hidden");
  if (logsVisible) loadLogs(currentLogsPage);
}, 30000);
