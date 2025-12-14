// Modern Attendance Monitor - JavaScript

const socket = io();
const connectionStatus = document.getElementById("connectionStatus");
const deviceStatus = document.getElementById("deviceStatus");
const liveIndicator = document.getElementById("liveIndicator");
const dataList = document.getElementById("dataList");
const totalRecords = document.getElementById("totalRecords");
const lastUpdate = document.getElementById("lastUpdate");
const uniqueStudents = document.getElementById("uniqueStudents");
const todayRecords = document.getElementById("todayRecords");
const todayDate = document.getElementById("todayDate");
const searchInput = document.getElementById("searchInput");
const filterButtons = document.querySelectorAll(".filter-btn");

let attendanceRecords = [];
let uniqueStudentIds = new Set();
let currentFilter = "all";
let searchQuery = "";

// Set today's date
const today = new Date();
todayDate.textContent = today.toLocaleDateString("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function updateStats() {
  totalRecords.textContent = attendanceRecords.length;
  uniqueStudents.textContent = uniqueStudentIds.size;

  const todayStr = new Date().toISOString().split("T")[0];
  const todayCount = attendanceRecords.filter(
    (r) => r.date === todayStr
  ).length;
  todayRecords.textContent = todayCount;

  const now = new Date();
  lastUpdate.textContent = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatTime(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFilteredRecords() {
  let filtered = [...attendanceRecords];

  // Apply search filter
  if (searchQuery) {
    filtered = filtered.filter((item) =>
      item.student_id?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Apply time filter
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (currentFilter === "today") {
    filtered = filtered.filter((item) => item.date === todayStr);
  } else if (currentFilter === "recent") {
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    filtered = filtered.filter((item) => {
      const recordDate = new Date(item.updated_at || item.created_at);
      return recordDate >= oneDayAgo;
    });
  }

  return filtered;
}

function renderAttendanceList() {
  const filtered = getFilteredRecords();

  if (filtered.length === 0) {
    dataList.innerHTML = `
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <p>${
          searchQuery || currentFilter !== "all"
            ? "No records match your filter"
            : "Waiting for attendance data..."
        }</p>
      </div>
    `;
    return;
  }

  const sortedRecords = filtered.sort((a, b) => {
    return (
      new Date(b.updated_at || b.created_at) -
      new Date(a.updated_at || a.created_at)
    );
  });

  dataList.innerHTML = `
    <div class="data-header">
      <div>Student ID</div>
      <div>In Time</div>
      <div>Out Time</div>
      <div>Date</div>
    </div>
    ${sortedRecords
      .map((item) => {
        const isToday =
          item.date === new Date().toISOString().split("T")[0];
        
        // Attendance Logic Improvements
        const hasInTime = item.in_time && item.in_time !== "N/A";
        const hasOutTime = item.out_time && item.out_time !== "N/A";
        const isInPremises = hasInTime && !hasOutTime;
        const isCheckedOut = hasInTime && hasOutTime;
        const isAbsent = !hasInTime && !hasOutTime;
        
        // Calculate duration if both times exist
        let duration = "";
        if (hasInTime && hasOutTime) {
          const inTime = new Date(item.in_time);
          const outTime = new Date(item.out_time);
          const diffMs = outTime - inTime;
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          duration = `${diffHours}h ${diffMinutes}m`;
        }
        
        return `
        <div class="data-item" data-id="${item.student_id}-${item.date}">
          <div class="student-id">
            <i data-lucide="user"></i>
            ${item.student_id || "N/A"}
          </div>
          <div class="time">
            <span class="time-badge in-time">
              <i data-lucide="log-in"></i>
              ${hasInTime ? formatTime(item.in_time) : "Not checked in"}
            </span>
          </div>
          <div class="time">
            ${
              isInPremises
                ? `<span class="time-badge in-premises">
                    <i data-lucide="map-pin"></i>
                    In Premises
                   </span>`
                : hasOutTime
                ? `<span class="time-badge out-time">
                    <i data-lucide="log-out"></i>
                    ${formatTime(item.out_time)}
                    ${duration ? `<small style="margin-left: 4px; opacity: 0.8;">(${duration})</small>` : ""}
                   </span>`
                : `<span class="time-badge" style="background: var(--bg-tertiary); color: var(--text-tertiary);">
                    <i data-lucide="x-circle"></i>
                    Not checked out
                   </span>`
            }
          </div>
          <div class="date-badge">
            <i data-lucide="calendar"></i>
            ${formatDate(item.date)}${isToday ? " (Today)" : ""}
            ${isInPremises ? '<span style="margin-left: 6px; color: var(--accent-blue);">●</span>' : ""}
          </div>
        </div>
      `;
      })
      .join("")}
  `;
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function addOrUpdateRecord(newRecord) {
  const recordKey = `${newRecord.student_id}-${newRecord.date}`;
  const existingIndex = attendanceRecords.findIndex(
    (r) =>
      r.student_id === newRecord.student_id && r.date === newRecord.date
  );

  if (existingIndex >= 0) {
    attendanceRecords[existingIndex] = newRecord;
  } else {
    attendanceRecords.unshift(newRecord);
  }

  uniqueStudentIds.add(newRecord.student_id);
  updateStats();
  renderAttendanceList();

  const recordElement = document.querySelector(
    `[data-id="${recordKey}"]`
  );
  if (recordElement) {
    recordElement.classList.add("new-event");
    setTimeout(() => {
      recordElement.classList.remove("new-event");
    }, 3000);
  }
}

// Search functionality
searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderAttendanceList();
});

// Filter functionality
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderAttendanceList();
  });
});

// Socket events
socket.on("connect", () => {
  connectionStatus.innerHTML =
    '<span class="status-dot"></span><span>Connected</span>';
  connectionStatus.className = "status-badge connected";
  liveIndicator.classList.add("active");
});

socket.on("disconnect", () => {
  connectionStatus.innerHTML =
    '<span class="status-dot"></span><span>Disconnected</span>';
  connectionStatus.className = "status-badge disconnected";
  liveIndicator.classList.remove("active");
});

socket.on("deviceStatus", (status) => {
  if (status.connected) {
    deviceStatus.innerHTML = `<i data-lucide="cpu"></i> Device: ${status.ip} (${
      status.type?.toUpperCase() || "TCP"
    })`;
    deviceStatus.className = "device-status connected";
  } else {
    deviceStatus.innerHTML = `<i data-lucide="cpu"></i> Device: Disconnected${
      status.error ? " - " + status.error : ""
    }`;
    deviceStatus.className = "device-status disconnected";
  }
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

// Request device status on connect
socket.on("connect", () => {
  fetch("/api/device-status")
    .then(res => res.json())
    .then(data => {
      if (data.is_connected) {
        socket.emit("requestDeviceStatus");
      }
    })
    .catch(err => console.error("Error fetching device status:", err));
});

socket.on("attendanceEvent", (data) => {
  if (data) {
    addOrUpdateRecord(data);
  }
});

socket.on("attendanceData", (data) => {
  if (data && Array.isArray(data) && data.length > 0) {
    attendanceRecords = [];
    uniqueStudentIds.clear();
    data.forEach((item) => {
      if (item.student_id) {
        uniqueStudentIds.add(item.student_id);
        attendanceRecords.push(item);
      }
    });
    updateStats();
    renderAttendanceList();
  }
});

// IndexedDB Setup
const DB_NAME = "attendanceLogs";
const DB_VERSION = 1;
const STORE_NAME = "logs";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        objectStore.createIndex("user_id", "user_id", { unique: false });
        objectStore.createIndex("date", "date", { unique: false });
        objectStore.createIndex("timestamp", "timestamp", {
          unique: false,
        });
      }
    };
  });
}

async function storeLogInIndexedDB(logData) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const logEntry = {
      ...logData,
      timestamp: new Date().toISOString(),
      date: new Date(logData.att_time).toISOString().split("T")[0],
    };

    await store.add(logEntry);
    console.log("Log stored in IndexedDB:", logEntry);
    return true;
  } catch (error) {
    console.error("Error storing log in IndexedDB:", error);
    return false;
  }
}

async function loadLogsFromIndexedDB() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, "prev");
      const logs = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          logs.push(cursor.value);
          cursor.continue();
        } else {
          resolve(logs);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error loading logs from IndexedDB:", error);
    return [];
  }
}

async function loadIndexedDBLogs() {
  const logs = await loadLogsFromIndexedDB();
  if (logs.length > 0) {
    // Group logs by user_id and date
    const recordsMap = new Map();

    logs.forEach((log) => {
      const key = `${log.user_id}-${log.date}`;
      if (!recordsMap.has(key)) {
        recordsMap.set(key, {
          student_id: log.user_id,
          in_time: null,
          out_time: null,
          date: log.date,
          attendance_type: "machine",
          school_code: log.school_id?.toString() || "1",
          created_at: log.timestamp,
          updated_at: log.timestamp,
        });
      }

      const record = recordsMap.get(key);
      if (log.record_type === "Check-in") {
        record.in_time = log.att_time;
        if (new Date(log.timestamp) < new Date(record.created_at)) {
          record.created_at = log.timestamp;
        }
      } else if (log.record_type === "Check-out") {
        record.out_time = log.att_time;
        record.updated_at = log.timestamp;
      }
    });

    // Add records to attendanceRecords
    recordsMap.forEach((record) => {
      attendanceRecords.unshift(record);
      uniqueStudentIds.add(record.student_id);
    });

    updateStats();
    renderAttendanceList();
  }
}

// Test Form Handling
const testForm = document.getElementById("testAttendanceForm");
const formAlert = document.getElementById("formAlert");
const submitBtn = document.getElementById("submitForm");
const resetBtn = document.getElementById("resetForm");

function showAlert(message, type = "info") {
  const icons = {
    success: '<i data-lucide="check-circle"></i>',
    error: '<i data-lucide="x-circle"></i>',
    info: '<i data-lucide="info"></i>'
  };
  
  formAlert.innerHTML = `
    <div class="alert alert-${type}">
      ${icons[type] || icons.info}
      <span>${message}</span>
    </div>
  `;
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  setTimeout(() => {
    formAlert.innerHTML = "";
  }, type === "error" ? 5000 : 3000);
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Dummy data templates
const dummyData = {
  studentCheckIn: {
    id: 18204,
    user_id: "2025004",
    terminal_sn: "TERM-12345",
    user_name: "Alice Smith",
    record_type: "Check-in"
  },
  studentCheckOut: {
    id: 18204,
    user_id: "2025004",
    terminal_sn: "TERM-12345",
    user_name: "Alice Smith",
    record_type: "Check-out"
  },
  staffCheckIn: {
    id: Math.floor(Math.random() * 100000),
    user_id: "STAFF001",
    terminal_sn: "TERM-12345",
    user_name: "Bob Johnson",
    record_type: "Check-in"
  },
  staffCheckOut: {
    id: Math.floor(Math.random() * 100000),
    user_id: "STAFF001",
    terminal_sn: "TERM-12345",
    user_name: "Bob Johnson",
    record_type: "Check-out"
  }
};

function fillForm(data) {
  document.getElementById("testId").value = data.id;
  document.getElementById("testUserId").value = data.user_id;
  document.getElementById("testTerminalSn").value = data.terminal_sn;
  document.getElementById("testUserName").value = data.user_name;
  document.getElementById("testRecordType").value = data.record_type;
  const now = new Date();
  document.getElementById("testAttTime").value = formatDateTimeLocal(now);
}

// Set default values
function setDefaultValues() {
  fillForm(dummyData.studentCheckIn);
}

// Fetch school ID from server
let currentSchoolId = 1;
async function fetchSchoolId() {
  try {
    const response = await fetch("/api/school-id");
    const data = await response.json();
    if (data.school_id) {
      currentSchoolId = data.school_id;
      document.getElementById("schoolIdDisplay").textContent = data.school_id;
    }
  } catch (error) {
    document.getElementById("schoolIdDisplay").textContent = "N/A";
  }
}

// Check device connection status and show/hide form
async function checkDeviceStatus() {
  try {
    const response = await fetch("/api/device-status");
    const data = await response.json();
    const testFormContainer = document.getElementById("testFormContainer");
    
    if (data.device_connected) {
      // Hide form if device is connected
      testFormContainer.style.display = "none";
    } else {
      // Show form if device is not connected (virtual mode)
      testFormContainer.style.display = "block";
    }
  } catch (error) {
    console.error("Error checking device status:", error);
    // Default to showing form if check fails
    document.getElementById("testFormContainer").style.display = "block";
  }
}

// Collapsible form functionality
function initCollapsibleForm() {
  const testFormContainer = document.getElementById("testFormContainer");
  const toggleButton = document.getElementById("toggleForm");
  const formHeader = document.querySelector(".test-form-header");
  
  if (!toggleButton || !testFormContainer) return;
  
  // Toggle on button click
  toggleButton.addEventListener("click", (e) => {
    e.stopPropagation();
    testFormContainer.classList.toggle("collapsed");
    updateCollapseIcon();
  });
  
  // Toggle on header click
  formHeader.addEventListener("click", (e) => {
    // Don't toggle if clicking on quick fill buttons
    if (!e.target.closest(".quick-fill-buttons") && !e.target.closest(".btn-collapse")) {
      testFormContainer.classList.toggle("collapsed");
      updateCollapseIcon();
    }
  });
  
  function updateCollapseIcon() {
    const collapseIcon = document.getElementById("collapseIcon");
    if (collapseIcon) {
      const isCollapsed = testFormContainer.classList.contains("collapsed");
      collapseIcon.setAttribute("data-lucide", isCollapsed ? "chevron-down" : "chevron-up");
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }
}

// Quick fill button handlers
document.getElementById("fillStudentCheckIn").addEventListener("click", () => {
  fillForm(dummyData.studentCheckIn);
});

document.getElementById("fillStudentCheckOut").addEventListener("click", () => {
  fillForm(dummyData.studentCheckOut);
});

document.getElementById("fillStaffCheckIn").addEventListener("click", () => {
  fillForm(dummyData.staffCheckIn);
});

document.getElementById("fillStaffCheckOut").addEventListener("click", () => {
  fillForm(dummyData.staffCheckOut);
});

setDefaultValues();
fetchSchoolId();

testForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const formData = new FormData(testForm);
  const data = {};
  
  // Convert form data to object
  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }

  // Convert datetime-local to required format (YYYY-MM-DD HH:mm:ss)
  if (data.att_time) {
    const date = new Date(data.att_time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    data.att_time = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader-2"></i> Sending...';
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const response = await fetch("/api/test-attendance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (result.success) {
      // Store in IndexedDB
      const logData = {
        id: parseInt(data.id),
        user_id: data.user_id,
        terminal_sn: data.terminal_sn,
        user_name: data.user_name,
        att_time: data.att_time,
        record_type: data.record_type,
        school_id: currentSchoolId,
      };
      await storeLogInIndexedDB(logData);

      showAlert(
        `Success! ${result.message || "Attendance sent successfully"}`,
        "success"
      );
      testForm.reset();
      setDefaultValues();
    } else {
      showAlert(
        `Error: ${result.message || "Failed to send attendance"}`,
        "error"
      );
    }
  } catch (error) {
    showAlert(`Error: ${error.message || "Network error"}`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send"></i> Send Test Attendance';
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
});

// Update dummy data IDs
function updateDummyDataIds() {
  dummyData.studentCheckIn.id = Math.floor(Math.random() * 100000);
  dummyData.studentCheckOut.id = Math.floor(Math.random() * 100000);
  dummyData.staffCheckIn.id = Math.floor(Math.random() * 100000);
  dummyData.staffCheckOut.id = Math.floor(Math.random() * 100000);
}

resetBtn.addEventListener("click", () => {
  updateDummyDataIds();
  testForm.reset();
  setDefaultValues();
  formAlert.innerHTML = "";
});

// Initialize
updateStats();
renderAttendanceList();
loadIndexedDBLogs();
checkDeviceStatus();
initCollapsibleForm();

// Theme Toggle Functionality
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

// Initialize theme toggle button
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// Initialize Lucide icons when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  });
} else {
  initTheme();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

