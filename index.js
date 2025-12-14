const express = require("express");
const cors = require("cors");
const ZKHLIB = require("zkh-lib");
const http = require("http");
const axios = require("axios");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketIo(server, {
  maxHttpBufferSize: 1e6,
  pingTimeout: 60000,
});

// Fix MaxListenersExceededWarning
io.engine.setMaxListeners(20);

// Handle socket connections
io.on("connection", (socket) => {
  // Send current device status to newly connected client
  socket.emit("deviceStatus", {
    connected: isConnected,
    ip: DEVICE_IP,
    type: zkDevice?.connectionType || null,
    error: isConnected
      ? null
      : DEVICE_IP
      ? "Not connected"
      : "Device IP not configured",
  });

  // Handle device status requests
  socket.on("requestDeviceStatus", () => {
    socket.emit("deviceStatus", {
      connected: isConnected,
      ip: DEVICE_IP,
      type: zkDevice?.connectionType || null,
      error: isConnected
        ? null
        : DEVICE_IP
        ? "Not connected"
        : "Device IP not configured",
    });
  });
});

// Periodic device status update
setInterval(() => {
  io.emit("deviceStatus", {
    connected: isConnected,
    ip: DEVICE_IP,
    type: zkDevice?.connectionType || null,
    error: isConnected
      ? null
      : DEVICE_IP
      ? "Not connected"
      : "Device IP not configured",
  });
}, 5000); // Update every 5 seconds

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ZKTeco K60 Device Configuration
// Device configuration will be loaded from file or set via admin interface
let DEVICE_IP = null;
let DEVICE_PORT = 4370;
let DEVICE_TIMEOUT = 5200;
let DEVICE_UDP_PORT = 5000;

// Load device config from file if exists
const fs = require("fs");
const path = require("path");
const CONFIG_FILE = path.join(__dirname, "device-config.json");
const INVALID_USERS_FILE = path.join(__dirname, "invalid-users.json");

function loadDeviceConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      DEVICE_IP = config.ip || null;
      DEVICE_PORT = config.port || 4370;
      DEVICE_TIMEOUT = config.timeout || 5200;
      DEVICE_UDP_PORT = config.udpPort || 5000;
      console.log("Device config loaded from file:", {
        ip: DEVICE_IP,
        port: DEVICE_PORT,
      });
    }
  } catch (err) {
    console.warn("Could not load device config:", err.message);
  }
}

function saveDeviceConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    DEVICE_IP = config.ip;
    DEVICE_PORT = config.port || 4370;
    DEVICE_TIMEOUT = config.timeout || 5200;
    DEVICE_UDP_PORT = config.udpPort || 5000;
    return true;
  } catch (err) {
    console.error("Error saving device config:", err);
    return false;
  }
}

loadDeviceConfig();

// Initialize invalid user IDs set before loading from file
let invalidUserIds = new Set();

// Load invalid user IDs from file (IndexedDB-like persistent storage)
function loadInvalidUserIds() {
  try {
    if (fs.existsSync(INVALID_USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(INVALID_USERS_FILE, "utf8"));
      invalidUserIds = new Set(data.userIds || []);
      console.log(
        `Loaded ${invalidUserIds.size} invalid user IDs from persistent storage`
      );
    } else {
      // Create empty file if it doesn't exist
      saveInvalidUserIds();
    }
  } catch (err) {
    console.warn("Could not load invalid user IDs:", err.message);
    // Initialize empty set if file is corrupted
    invalidUserIds = new Set();
  }
}

// Save invalid user IDs to file (IndexedDB-like persistent storage)
function saveInvalidUserIds() {
  try {
    const data = {
      userIds: Array.from(invalidUserIds),
      lastUpdated: new Date().toISOString(),
      count: invalidUserIds.size,
    };
    fs.writeFileSync(INVALID_USERS_FILE, JSON.stringify(data, null, 2), {
      flag: "w",
    });
    return true;
  } catch (err) {
    console.error("Error saving invalid user IDs:", err);
    return false;
  }
}

// Add user ID to invalid list and persist immediately
function addInvalidUserId(userId) {
  if (userId && !invalidUserIds.has(userId)) {
    invalidUserIds.add(userId);
    const saved = saveInvalidUserIds();
    if (saved) {
      console.log(
        `✓ Added invalid user ID to persistent storage: ${userId} (Total: ${invalidUserIds.size})`
      );
    } else {
      console.warn(`⚠ Failed to save invalid user ID: ${userId}`);
    }
  }
}

// Check if user ID is invalid
function isInvalidUserId(userId) {
  return userId && invalidUserIds.has(userId.toString());
}

loadInvalidUserIds();

// API Configuration
const API_BASE_URL =
  process.env.API_BASE_URL || "https://backend.academichelperbd.xyz";
const API_VERSION = process.env.API_VERSION || "v1";
const SCHOOL_ID = parseInt(process.env.SCHOOL_ID || "1");
const TERMINAL_SN = process.env.TERMINAL_SN || "TERM-12345";

// Device Connection Control
const DEVICE_CONNECTED = process.env.DEVICE_CONNECTED === "true";

// Connection state management
let zkDevice = null;
let isConnected = false;
let isConnecting = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let lastProcessedRecordTime = null;
let pollingInterval = null;
let syncInterval = null; // Periodic sync interval
let syncedRecordIds = new Set(); // Track synced records to avoid duplicates
// invalidUserIds is declared earlier before loadInvalidUserIds()
let lastSyncTime = null; // Track last successful sync time
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_BASE = 5000;
const POLLING_INTERVAL = 5000; // Poll every 5 seconds for new records
const SYNC_INTERVAL = 5000; // Sync every 5 seconds

function formatDateTime(date) {
  const pad = (num) => (num < 10 ? "0" + num : num);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

async function sendAttendanceToAPI(apiPayload) {
  try {
    const apiUrl = `${API_BASE_URL}/api/${API_VERSION}/machine-attendance`;
    const response = await axios.post(apiUrl, apiPayload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log(
      `API Response: ${response.status} - ${
        response.data?.message || response.statusText
      }`
    );
    return { success: true, data: response.data };
  } catch (error) {
    const errorData = error.response?.data || {};
    const errorMessage = errorData.message || error.message;

    // Check if user not found error
    if (
      error.response?.status === 404 ||
      (errorData.success === false &&
        (errorMessage.includes("not found") ||
          errorMessage.includes("not found in students or staffs")))
    ) {
      const userId = apiPayload.user_id;
      console.warn(
        `User ID ${userId} not found in students/staffs: ${errorMessage}`
      );
      return {
        success: false,
        error: "USER_NOT_FOUND",
        message: errorMessage,
        userId: userId,
      };
    }

    console.error(
      "Error sending attendance to API:",
      errorData || error.message
    );
    return {
      success: false,
      error: "API_ERROR",
      message: errorMessage,
      userId: apiPayload.user_id,
    };
  }
}

async function getUserNameFromDevice(userId) {
  try {
    if (zkDevice && isConnected) {
      const users = await zkDevice.getUsers();
      if (users?.data) {
        const user = users.data.find(
          (u) => u.uid === userId || u.userId === userId || u.id === userId
        );
        if (user) {
          return user.name || user.userName || null;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not fetch user name for ${userId}:`, err.message);
  }
  return null;
}

async function processAttendanceLog(
  entry,
  source = "realtime",
  skipSync = false
) {
  try {
    if (!entry || !entry.deviceUserId) {
      console.error(`[${source}] Invalid entry data:`, entry);
      return { success: false, reason: "INVALID_ENTRY" };
    }

    const userId = entry.deviceUserId.toString();

    // Skip if user ID is in invalid list
    if (isInvalidUserId(userId)) {
      console.log(`[${source}] Skipping invalid user ID: ${userId}`);
      return { skipped: true, reason: "INVALID_USER" };
    }

    const recordDate = new Date(entry.recordTime);
    const formattedDate = recordDate.toISOString().split("T")[0];
    const formattedTime = formatDateTime(recordDate);

    // Create unique record identifier
    const recordKey = `${userId}-${formattedDate}-${formattedTime}`;

    // Skip if already synced
    if (syncedRecordIds.has(recordKey) && !skipSync) {
      return { skipped: true, reason: "ALREADY_SYNCED" };
    }

    // Update last processed record time
    if (recordDate > (lastProcessedRecordTime || new Date(0))) {
      lastProcessedRecordTime = recordDate;
    }

    // Get user name from device or use fallback
    const userName =
      entry.userName ||
      (await getUserNameFromDevice(entry.deviceUserId)) ||
      userId;

    // Generate unique ID (using timestamp + user ID hash)
    const timestampStr = Date.now().toString().slice(-8);
    const userIdStr = userId.slice(-4);
    const recordId = (timestampStr + userIdStr).slice(0, 10);

    // Prepare API payload according to doc.md structure
    const apiPayload = {
      id: parseInt(recordId) || Math.floor(Math.random() * 1000000000),
      user_id: userId,
      terminal_sn: TERMINAL_SN,
      user_name: userName,
      att_time: formattedTime,
      record_type: "Check-in",
      school_id: SCHOOL_ID,
    };

    // Prepare data for frontend
    const apiData = {
      student_id: userId,
      in_time: formattedTime,
      out_time: formattedTime,
      machine_no: null,
      date: formattedDate,
      attendance_type: "machine",
      school_code: "10106",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(
      `[${source}] Processing attendance record: User ${userId} - ${formattedTime}`
    );

    // Send to new API endpoint
    console.log(`[${source}] Sending to API:`, {
      user_id: userId,
      att_time: formattedTime,
      school_id: SCHOOL_ID,
    });

    const result = await sendAttendanceToAPI(apiPayload);

    if (result && result.success) {
      syncedRecordIds.add(recordKey);
      lastSyncTime = new Date();
      io.emit("attendanceEvent", apiData);
      console.log(
        `[${source}] ✓ Successfully synced record for user ${userId}`
      );
      return { success: true };
    } else if (result && result.error === "USER_NOT_FOUND") {
      // Add to invalid users list (persisted in IndexedDB-like storage)
      addInvalidUserId(userId);
      console.log(
        `[${source}] ✗ User ${userId} not found - added to invalid users list (will skip in future)`
      );
      return { success: false, reason: "USER_NOT_FOUND", userId: userId };
    } else {
      // Other API errors - will retry later
      const errorMsg = result?.message || "Unknown error";
      console.error(
        `[${source}] ✗ Failed to sync record ${recordKey}: ${errorMsg}`
      );
      return { success: false, reason: "API_ERROR", message: errorMsg };
    }
  } catch (err) {
    console.error("Error processing attendance log:", err);
    return { success: false, reason: "EXCEPTION", error: err.message };
  }
}

function handleRealTimeLog(data) {
  console.log("=== Real-time log callback triggered ===");
  console.log("Raw data received:", JSON.stringify(data, null, 2));
  console.log("Data type:", typeof data);
  console.log("Data keys:", data ? Object.keys(data) : "null");

  if (!data) {
    console.warn(
      "Warning: Received null/undefined data in real-time log callback"
    );
    return;
  }

  console.log("Real-time attendance log received:", data);

  // decodeRecordRealTimeLog52 returns { userId, attTime }
  const entry = {
    deviceUserId: data.userId || data.deviceUserId || data.uid || data.user_id,
    recordTime:
      data.attTime ||
      data.recordTime ||
      data.time ||
      data.timestamp ||
      new Date(),
    deviceId: data.deviceId || data.device_id || null,
    userName: data.userName || data.name || data.user_name || null,
  };

  console.log("Processed entry:", entry);

  if (!entry.deviceUserId) {
    console.error("Error: No user ID found in real-time log data");
    console.error("Available data properties:", Object.keys(data));
    return;
  }

  if (!entry.recordTime || entry.recordTime === new Date()) {
    console.warn("Warning: No valid timestamp found, using current time");
    entry.recordTime = new Date();
  }

  processAttendanceLog(entry);
}

async function checkNetworkConnectivity() {
  if (!DEVICE_IP) return false;

  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();
    const timeout = 3000;

    socket.setTimeout(timeout);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });

    socket.connect(DEVICE_PORT, DEVICE_IP);
  });
}

async function syncOfflineData() {
  if (!isConnected || !zkDevice) {
    return;
  }

  try {
    console.log("\n=== Syncing offline data ===");
    const allLogs = await zkDevice.getAttendances();

    if (!allLogs?.data || allLogs.data.length === 0) {
      console.log("No records found on device");
      return { synced: 0, skipped: 0, invalid: 0 };
    }

    // Filter records that haven't been synced and are not from invalid users
    const unsyncedRecords = allLogs.data.filter((record) => {
      if (!record || !record.deviceUserId) {
        return false;
      }

      const userId = record.deviceUserId.toString();

      // Skip invalid user IDs (from persistent storage)
      if (isInvalidUserId(userId)) {
        return false;
      }

      const recordDate = new Date(record.recordTime);
      if (isNaN(recordDate.getTime())) {
        return false; // Skip invalid dates
      }

      const formattedDate = recordDate.toISOString().split("T")[0];
      const formattedTime = formatDateTime(recordDate);
      const recordKey = `${userId}-${formattedDate}-${formattedTime}`;
      return !syncedRecordIds.has(recordKey);
    });

    if (unsyncedRecords.length > 0) {
      console.log(
        `Found ${unsyncedRecords.length} unsynced records, syncing...`
      );

      // Sort by time to process in chronological order
      const sortedRecords = unsyncedRecords.sort(
        (a, b) => new Date(a.recordTime) - new Date(b.recordTime)
      );

      let syncedCount = 0;
      let skippedCount = 0;
      let invalidCount = 0;

      for (const record of sortedRecords) {
        const entry = {
          deviceUserId: record.deviceUserId,
          recordTime: record.recordTime,
          deviceId: record.ip || null,
          userName: record.userName || record.name || null,
        };

        const result = await processAttendanceLog(entry, "offline-sync");

        if (result?.success) {
          syncedCount++;
        } else if (result?.reason === "USER_NOT_FOUND") {
          invalidCount++;
        } else if (result?.skipped) {
          skippedCount++;
        }

        // Small delay to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(
        `✓ Sync complete: ${syncedCount} synced, ${skippedCount} skipped, ${invalidCount} invalid users`
      );
      return {
        synced: syncedCount,
        skipped: skippedCount,
        invalid: invalidCount,
      };
    } else {
      console.log("All records are already synced or from invalid users");
      return { synced: 0, skipped: 0, invalid: 0 };
    }
  } catch (err) {
    console.error("Error syncing offline data:", err.message);
    return { synced: 0, skipped: 0, invalid: 0, error: err.message };
  }
}

async function connectToDevice() {
  if (isConnecting || isConnected) {
    return;
  }

  if (!DEVICE_IP) {
    console.warn(
      "Device IP not configured. Please configure device in admin interface."
    );
    io.emit("deviceStatus", {
      connected: false,
      ip: null,
      error: "Device IP not configured",
    });
    return;
  }

  isConnecting = true;
  reconnectAttempts = 0;

  try {
    console.log(
      `Connecting to ZKTeco K60 device at ${DEVICE_IP}:${DEVICE_PORT}...`
    );

    const canReach = await checkNetworkConnectivity();
    if (!canReach) {
      console.warn(
        `Warning: Cannot reach device at ${DEVICE_IP}:${DEVICE_PORT}. Please verify network connectivity.`
      );
    }

    zkDevice = new ZKHLIB(
      DEVICE_IP,
      DEVICE_PORT,
      DEVICE_TIMEOUT,
      DEVICE_UDP_PORT
    );

    const errorHandler = (err) => {
      console.error("Device connection error:", err);
      isConnected = false;
      isConnecting = false;
      io.emit("deviceStatus", {
        connected: false,
        ip: DEVICE_IP,
        error: err.message || "Connection error",
      });
      scheduleReconnect();
    };

    const closeHandler = () => {
      console.log("Device connection closed");
      isConnected = false;
      isConnecting = false;
      io.emit("deviceStatus", {
        connected: false,
        ip: DEVICE_IP,
        error: "Connection closed",
      });
      scheduleReconnect();
    };

    await zkDevice.createSocket(errorHandler, closeHandler);

    const connectionType = zkDevice.connectionType;
    console.log(
      `Connected to device via ${connectionType.toUpperCase()} at ${DEVICE_IP}:${DEVICE_PORT}`
    );

    isConnected = true;
    isConnecting = false;
    reconnectAttempts = 0;

    io.emit("deviceStatus", {
      connected: true,
      ip: DEVICE_IP,
      type: connectionType,
    });

    console.log("Setting up real-time log monitoring...");

    try {
      await zkDevice.getRealTimeLogs(handleRealTimeLog);
      console.log(
        "Real-time log monitoring started - waiting for attendance events..."
      );
    } catch (err) {
      console.error("Error setting up real-time logs:", err);
    }

    // Initialize last processed time and start polling
    setTimeout(async () => {
      try {
        console.log("\n=== Initializing attendance monitoring ===");
        const initialLogs = await zkDevice.getAttendances();
        console.log("✓ Device communication verified");
        console.log(
          "Total attendance records on device:",
          initialLogs?.data?.length || 0
        );

        if (initialLogs?.data?.length > 0) {
          // Set last processed time to the most recent record
          const records = initialLogs.data.sort(
            (a, b) => new Date(b.recordTime) - new Date(a.recordTime)
          );
          lastProcessedRecordTime = new Date(records[0].recordTime);
          console.log(
            "Last processed record time:",
            lastProcessedRecordTime.toLocaleString()
          );
          console.log(
            "Sample record structure:",
            JSON.stringify(records[0], null, 2)
          );
        }

        // Sync offline data when device comes back online
        await syncOfflineData();

        // Start periodic sync for unsynced data
        startPeriodicSync();

        // Start polling for new records
        startPollingForNewRecords();
        console.log(
          `\n✓ Polling started (checking every ${
            POLLING_INTERVAL / 1000
          } seconds for new records)`
        );
        console.log(
          "Ready to receive attendance data - scan fingerprints on the device"
        );
      } catch (err) {
        console.error("Initialization failed:", err.message);
      }
    }, 2000);
  } catch (err) {
    isConnecting = false;
    isConnected = false;
    console.error(
      `Failed to connect to device at ${DEVICE_IP}:${DEVICE_PORT}:`,
      err.message
    );
    io.emit("deviceStatus", {
      connected: false,
      ip: DEVICE_IP,
      error: err.message,
    });
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(
      `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection.`
    );
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1);
  console.log(
    `Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`
  );

  reconnectTimer = setTimeout(() => {
    if (!isConnected) {
      connectToDevice();
    }
  }, delay);
}

async function startPollingForNewRecords() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  pollingInterval = setInterval(async () => {
    if (!isConnected || !zkDevice) {
      return;
    }

    try {
      const logs = await zkDevice.getAttendances();
      if (!logs?.data || logs.data.length === 0) {
        return;
      }

      // Filter for new records (after last processed time) and exclude invalid users
      const newRecords = logs.data.filter((record) => {
        if (!record || !record.deviceUserId) {
          return false;
        }

        const userId = record.deviceUserId.toString();

        // Skip invalid user IDs (from persistent storage)
        if (isInvalidUserId(userId)) {
          return false;
        }

        const recordTime = new Date(record.recordTime);
        if (isNaN(recordTime.getTime())) {
          return false; // Skip invalid dates
        }

        return !lastProcessedRecordTime || recordTime > lastProcessedRecordTime;
      });

      if (newRecords.length > 0) {
        console.log(`\n📊 Found ${newRecords.length} new attendance record(s)`);

        // Process new records in order
        for (const record of newRecords.sort(
          (a, b) => new Date(a.recordTime) - new Date(b.recordTime)
        )) {
          const entry = {
            deviceUserId: record.deviceUserId,
            recordTime: record.recordTime,
            deviceId: record.ip || null,
            userName: record.userName || record.name || null,
          };
          await processAttendanceLog(entry, "polling");
        }
      }
    } catch (err) {
      console.error("Error polling for new records:", err.message);
    }
  }, POLLING_INTERVAL);
}

// Start periodic sync to ensure no data is left unsynced
function startPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  console.log(
    `Starting periodic sync (every ${SYNC_INTERVAL / 1000} seconds)...`
  );

  syncInterval = setInterval(async () => {
    if (!isConnected || !zkDevice) {
      return;
    }

    try {
      const result = await syncOfflineData();
      if (result && (result.synced > 0 || result.invalid > 0)) {
        console.log(
          `🔄 Periodic sync: ${result.synced} synced, ${result.invalid} invalid users`
        );
      }
    } catch (err) {
      console.error("Error in periodic sync:", err.message);
    }
  }, SYNC_INTERVAL);
}

async function disconnectFromDevice() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (zkDevice && isConnected) {
    try {
      await zkDevice.disconnect();
      console.log("Disconnected from device");
    } catch (err) {
      console.error("Error disconnecting from device:", err);
    }
  }
  isConnected = false;
  isConnecting = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await disconnectFromDevice();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down...");
  await disconnectFromDevice();
  process.exit(0);
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/admin", (req, res) => {
  res.sendFile(__dirname + "/public/admin.html");
});

// Get school ID endpoint
app.get("/api/school-id", (req, res) => {
  res.json({
    school_id: SCHOOL_ID,
  });
});

// Get device connection status endpoint
app.get("/api/device-status", (req, res) => {
  res.json({
    device_connected: DEVICE_CONNECTED && isConnected,
    is_connected: isConnected,
    is_connecting: isConnecting,
    device_ip: DEVICE_IP,
    device_configured: !!DEVICE_IP,
  });
});

// Get device configuration endpoint
app.get("/api/device-config", (req, res) => {
  res.json({
    ip: DEVICE_IP,
    port: DEVICE_PORT,
    timeout: DEVICE_TIMEOUT,
    udpPort: DEVICE_UDP_PORT,
    is_connected: isConnected,
  });
});

// Update device configuration endpoint
app.post("/api/device-config", (req, res) => {
  try {
    const { ip, port, timeout, udpPort } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        message: "Device IP is required",
      });
    }

    const config = {
      ip: ip.trim(),
      port: parseInt(port) || 4370,
      timeout: parseInt(timeout) || 5200,
      udpPort: parseInt(udpPort) || 5000,
    };

    if (saveDeviceConfig(config)) {
      // Disconnect current device if connected
      if (isConnected) {
        disconnectFromDevice().then(() => {
          // Reconnect with new config after a short delay
          setTimeout(() => {
            connectToDevice();
          }, 1000);
        });
      }

      res.json({
        success: true,
        message: "Device configuration updated successfully",
        config: config,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to save device configuration",
      });
    }
  } catch (error) {
    console.error("Error updating device config:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update device configuration",
    });
  }
});

// Get all device records grouped by school
app.get("/api/device-records", async (req, res) => {
  try {
    if (!isConnected || !zkDevice) {
      return res.status(400).json({
        success: false,
        message: "Device not connected",
      });
    }

    const logs = await zkDevice.getAttendances();

    if (!logs?.data || logs.data.length === 0) {
      return res.json({
        success: true,
        data: [],
        grouped: {},
      });
    }

    // Group records by school (we'll need to determine school from user_id or other means)
    // For now, return all records with a school field if available
    const records = logs.data.map((record) => ({
      userSn: record.userSn,
      deviceUserId: record.deviceUserId,
      recordTime: record.recordTime,
      ip: record.ip,
      userName: record.userName || record.name || null,
      // You may need to add school_id mapping logic here
      school_id: SCHOOL_ID, // Default to current school
    }));

    // Group by school_id (if you have multiple schools)
    const grouped = records.reduce((acc, record) => {
      const schoolId = record.school_id || "unknown";
      if (!acc[schoolId]) {
        acc[schoolId] = [];
      }
      acc[schoolId].push(record);
      return acc;
    }, {});

    res.json({
      success: true,
      data: records,
      grouped: grouped,
      total: records.length,
    });
  } catch (error) {
    console.error("Error fetching device records:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch device records",
    });
  }
});

// Test endpoint for virtual form submissions
app.post("/api/test-attendance", async (req, res) => {
  try {
    const { id, user_id, terminal_sn, user_name, att_time, record_type } =
      req.body;

    // Validate required fields
    if (
      !id ||
      !user_id ||
      !terminal_sn ||
      !user_name ||
      !att_time ||
      !record_type
    ) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "Missing required fields",
        data: null,
      });
    }

    // Prepare API payload (school_id comes from env)
    const apiPayload = {
      id: parseInt(id),
      user_id: user_id.toString(),
      terminal_sn: terminal_sn.toString(),
      user_name: user_name.toString(),
      att_time: att_time,
      record_type: record_type,
      school_id: SCHOOL_ID,
    };

    // Send to actual API
    const apiResponse = await sendAttendanceToAPI(apiPayload);

    // Emit real-time update to connected clients
    if (apiResponse?.data) {
      const recordDate = new Date(att_time);
      const formattedDate = recordDate.toISOString().split("T")[0];

      // Format data for frontend display (matching processAttendanceLog format)
      const frontendData = {
        student_id: user_id,
        in_time:
          record_type === "Check-in"
            ? att_time
            : apiResponse.data.in_time || att_time,
        out_time:
          record_type === "Check-out"
            ? att_time
            : apiResponse.data.out_time || null,
        date: formattedDate,
        attendance_type: "machine",
        school_code: SCHOOL_ID.toString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      io.emit("attendanceEvent", frontendData);
    }

    res.json({
      statusCode: 200,
      success: true,
      message: "Test attendance sent successfully",
      data: apiResponse,
    });
  } catch (error) {
    console.error("Error in test attendance endpoint:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      message:
        error.response?.data?.message ||
        error.message ||
        "Failed to send test attendance",
      data: error.response?.data || null,
    });
  }
});

server.listen(port, async () => {
  console.log(`Server is listening on http://localhost:${port}`);
  console.log(
    `Device Configuration: ${
      DEVICE_IP || "Not configured"
    }:${DEVICE_PORT} (Timeout: ${DEVICE_TIMEOUT}ms, UDP: ${DEVICE_UDP_PORT})`
  );
  console.log(
    `Device Connection: ${
      DEVICE_CONNECTED ? "ENABLED" : "DISABLED (Virtual Testing Mode)"
    }`
  );

  if (DEVICE_CONNECTED && DEVICE_IP) {
    await connectToDevice();
  } else {
    console.log(
      DEVICE_IP
        ? "Running in virtual testing mode. Use the test form to simulate attendance."
        : "Device IP not configured. Please configure device in admin interface."
    );
    io.emit("deviceStatus", {
      connected: false,
      ip: DEVICE_IP,
      mode: "virtual",
      error: DEVICE_IP ? null : "Device IP not configured",
    });
  }
});
