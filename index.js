const express = require("express");
const cors = require("cors");
const ZKHLIB = require("zkh-lib");
const { MongoClient, ServerApiVersion } = require("mongodb");
const http = require("http");
const axios = require("axios");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ZKTeco K60 Device Configuration
// Device Network: IP 192.168.68.104, TCP Port 4370, Gateway 192.168.68.1, Subnet 255.255.255.0
const DEVICE_IP = process.env.DEVICE_IP || "192.168.68.104";
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT || "4370");
const DEVICE_TIMEOUT = parseInt(process.env.DEVICE_TIMEOUT || "5200");
const DEVICE_UDP_PORT = parseInt(process.env.DEVICE_UDP_PORT || "5000");

const uri =
  "mongodb+srv://attendances:PzCebmsIIcgv81JE@cluster0.nuouh7o.mongodb.net/attendances?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Connection state management
let zkDevice = null;
let isConnected = false;
let isConnecting = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let dbConnected = false;
let lastProcessedRecordTime = null;
let pollingInterval = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_BASE = 5000;
const POLLING_INTERVAL = 5000; // Poll every 5 seconds for new records

function formatDateTime(date) {
  const pad = (num) => (num < 10 ? "0" + num : num);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

async function sendAttendanceToAPI(attendanceData) {
  try {
    const { _id, ...dataToSend } = attendanceData;
    dataToSend.machine_no = dataToSend.machine_no || "0";
    dataToSend.in_time = formatDateTime(new Date(dataToSend.in_time));
    dataToSend.out_time = formatDateTime(new Date(dataToSend.out_time));

    const response = await axios.post(
      "https://academichelperbd.com/api/create-attendance",
      dataToSend
    );
    console.log(response.statusText);
  } catch (error) {
    console.log(
      "Error sending attendance to API:",
      error.response?.data || error.message
    );
  }
}

async function ensureDbConnection() {
  if (!dbConnected) {
    try {
      await client.connect();
      dbConnected = true;
      console.log("MongoDB connected successfully");
    } catch (err) {
      console.error("MongoDB connection error:", err);
      dbConnected = false;
      throw err;
    }
  }
}

async function processAttendanceLog(entry, source = "realtime") {
  try {
    await ensureDbConnection();
    const attendanceCollection = client.db("attendances").collection("allLog");

    const recordDate = new Date(entry.recordTime);
    const formattedDate = recordDate.toISOString().split("T")[0];
    const formattedTime = formatDateTime(recordDate);

    // Update last processed record time
    if (recordDate > (lastProcessedRecordTime || new Date(0))) {
      lastProcessedRecordTime = recordDate;
    }

    const existingRecord = await attendanceCollection.findOne({
      student_id: entry.deviceUserId,
      date: formattedDate,
    });

    let apiData;
    if (!existingRecord) {
      apiData = {
        student_id: entry.deviceUserId,
        in_time: formattedTime,
        out_time: formattedTime,
        machine_no: null,
        date: formattedDate,
        attendance_type: "machine",
        attendance_status: "present",
        school_code: "10106",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await attendanceCollection.insertOne(apiData);
      console.log(`[${source}] New attendance record: Student ${entry.deviceUserId} - ${formattedTime}`);
    } else {
      apiData = {
        ...existingRecord,
        out_time: formattedTime,
        updated_at: new Date().toISOString(),
      };
      await attendanceCollection.updateOne(
        { student_id: entry.deviceUserId, date: formattedDate },
        {
          $set: {
            out_time: formattedTime,
            updated_at: new Date().toISOString(),
          },
        }
      );
      console.log(`[${source}] Updated attendance record: Student ${entry.deviceUserId} - ${formattedTime}`);
    }

    await sendAttendanceToAPI(apiData);
    io.emit("attendanceEvent", apiData);
  } catch (err) {
    console.error("Error processing attendance log:", err);
    dbConnected = false;
  }
}

function handleRealTimeLog(data) {
  console.log("=== Real-time log callback triggered ===");
  console.log("Raw data received:", JSON.stringify(data, null, 2));
  console.log("Data type:", typeof data);
  console.log("Data keys:", data ? Object.keys(data) : 'null');

  if (!data) {
    console.warn("Warning: Received null/undefined data in real-time log callback");
    return;
  }

  console.log("Real-time attendance log received:", data);

  // decodeRecordRealTimeLog52 returns { userId, attTime }
  const entry = {
    deviceUserId: data.userId || data.deviceUserId || data.uid || data.user_id,
    recordTime: data.attTime || data.recordTime || data.time || data.timestamp || new Date(),
    deviceId: data.deviceId || data.device_id || null,
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
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const timeout = 3000;

    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });

    socket.connect(DEVICE_PORT, DEVICE_IP);
  });
}

async function connectToDevice() {
  if (isConnecting || isConnected) {
    return;
  }

  isConnecting = true;
  reconnectAttempts = 0;

  try {
    console.log(`Connecting to ZKTeco K60 device at ${DEVICE_IP}:${DEVICE_PORT}...`);

    const canReach = await checkNetworkConnectivity();
    if (!canReach) {
      console.warn(`Warning: Cannot reach device at ${DEVICE_IP}:${DEVICE_PORT}. Please verify network connectivity.`);
      console.warn(`Device network: 192.168.68.104/24, Gateway: 192.168.68.1`);
    }

    zkDevice = new ZKHLIB(DEVICE_IP, DEVICE_PORT, DEVICE_TIMEOUT, DEVICE_UDP_PORT);

    const errorHandler = (err) => {
      console.error("Device connection error:", err);
      isConnected = false;
      scheduleReconnect();
    };

    const closeHandler = () => {
      console.log("Device connection closed");
      isConnected = false;
      scheduleReconnect();
    };

    await zkDevice.createSocket(errorHandler, closeHandler);

    const connectionType = zkDevice.connectionType;
    console.log(`Connected to device via ${connectionType.toUpperCase()} at ${DEVICE_IP}:${DEVICE_PORT}`);

    isConnected = true;
    isConnecting = false;
    reconnectAttempts = 0;

    io.emit("deviceStatus", { connected: true, ip: DEVICE_IP, type: connectionType });

    console.log("Setting up real-time log monitoring...");

    try {
      await zkDevice.getRealTimeLogs(handleRealTimeLog);
      console.log("Real-time log monitoring started - waiting for attendance events...");
    } catch (err) {
      console.error("Error setting up real-time logs:", err);
    }

    // Initialize last processed time and start polling
    setTimeout(async () => {
      try {
        console.log("\n=== Initializing attendance monitoring ===");
        const initialLogs = await zkDevice.getAttendances();
        console.log("✓ Device communication verified");
        console.log("Total attendance records on device:", initialLogs?.data?.length || 0);

        if (initialLogs?.data?.length > 0) {
          // Set last processed time to the most recent record
          const records = initialLogs.data.sort((a, b) =>
            new Date(b.recordTime) - new Date(a.recordTime)
          );
          lastProcessedRecordTime = new Date(records[0].recordTime);
          console.log("Last processed record time:", lastProcessedRecordTime.toLocaleString());
          console.log("Sample record structure:", JSON.stringify(records[0], null, 2));
        }

        // Start polling for new records
        startPollingForNewRecords();
        console.log(`\n✓ Polling started (checking every ${POLLING_INTERVAL / 1000} seconds for new records)`);
        console.log("Ready to receive attendance data - scan fingerprints on the device");
      } catch (err) {
        console.error("Initialization failed:", err.message);
      }
    }, 2000);

  } catch (err) {
    isConnecting = false;
    isConnected = false;
    console.error(`Failed to connect to device at ${DEVICE_IP}:${DEVICE_PORT}:`, err.message);
    io.emit("deviceStatus", { connected: false, ip: DEVICE_IP, error: err.message });
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection.`);
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1);
  console.log(`Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);

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

      // Filter for new records (after last processed time)
      const newRecords = logs.data.filter(record => {
        const recordTime = new Date(record.recordTime);
        return !lastProcessedRecordTime || recordTime > lastProcessedRecordTime;
      });

      if (newRecords.length > 0) {
        console.log(`\n📊 Found ${newRecords.length} new attendance record(s)`);

        // Process new records in order
        for (const record of newRecords.sort((a, b) =>
          new Date(a.recordTime) - new Date(b.recordTime)
        )) {
          const entry = {
            deviceUserId: record.deviceUserId,
            recordTime: record.recordTime,
            deviceId: record.ip || null,
          };
          await processAttendanceLog(entry, "polling");
        }
      }
    } catch (err) {
      console.error("Error polling for new records:", err.message);
    }
  }, POLLING_INTERVAL);
}

async function disconnectFromDevice() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
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

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await disconnectFromDevice();
  if (dbConnected) {
    await client.close();
    dbConnected = false;
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await disconnectFromDevice();
  if (dbConnected) {
    await client.close();
    dbConnected = false;
  }
  process.exit(0);
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

server.listen(port, async () => {
  console.log(`Server is listening on http://localhost:${port}`);
  console.log(`Device Configuration: ${DEVICE_IP}:${DEVICE_PORT} (Timeout: ${DEVICE_TIMEOUT}ms, UDP: ${DEVICE_UDP_PORT})`);
  await connectToDevice();
});
