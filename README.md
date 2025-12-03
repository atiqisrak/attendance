# Attendance Management System

A real-time attendance tracking system that integrates with biometric attendance devices (ZKTeco/ZK devices) to automatically capture, store, and sync attendance data. This system connects to biometric machines, stores attendance records in MongoDB, and synchronizes data with external APIs in real-time.

## 🎯 Main Purpose

This project serves as a middleware system that:
- **Connects to biometric attendance devices** (ZKTeco/ZK machines) via network
- **Automatically fetches attendance logs** from connected devices at regular intervals
- **Stores attendance data** in MongoDB database for persistence
- **Synchronizes attendance records** with external academic management systems via API
- **Provides real-time updates** using WebSocket (Socket.IO) for live attendance monitoring
- **Tracks student attendance** with in-time and out-time records

## ✨ Features

- 🔄 **Automatic Data Synchronization**: Fetches attendance data from biometric devices every 30 seconds
- 📊 **Real-time Updates**: Uses Socket.IO for live attendance data broadcasting
- 💾 **Database Storage**: Stores attendance records in MongoDB with duplicate prevention
- 🔌 **API Integration**: Automatically syncs attendance data to external academic management systems
- ⏰ **Time Tracking**: Records both in-time and out-time for each student
- 🎯 **Smart Record Management**: Updates existing records instead of creating duplicates

## 🛠️ Technology Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database for storing attendance records
- **Socket.IO** - Real-time bidirectional communication
- **zkh-lib** - Library for connecting to ZKTeco/ZK biometric devices
- **Axios** - HTTP client for API requests
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variable management

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** (Node Package Manager)
- **MongoDB** (MongoDB Atlas account or local MongoDB instance)
- **Biometric Device** (ZKTeco/ZK device) connected to the network
- **Network Access** to the biometric device

## 🚀 Installation

1. **Clone the repository** (or navigate to the project directory):
   ```bash
   cd attendance
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory with the following variables:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   DEVICE_IP=192.168.0.58
   DEVICE_PORT=4370
   API_ENDPOINT=https://academichelperbd.com/api/create-attendance
   SCHOOL_CODE=10106
   ```

4. **Configure device connection**:
   Update the device IP address and port in `index.js` (currently set to `192.168.0.58:4370`) or use environment variables.

## 📖 Usage

### Starting the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 5000).

### How It Works

1. **Device Connection**: The system connects to the biometric device at the configured IP address
2. **Data Fetching**: Every 30 seconds, the system fetches new attendance logs from the device
3. **Data Processing**: 
   - Checks if a record already exists for the student on that date
   - If new: Creates a record with in-time and out-time set to the same timestamp
   - If exists: Updates the out-time to the latest timestamp
4. **Database Storage**: Attendance records are stored in MongoDB (`attendances.allLog` collection)
5. **API Sync**: Each record is automatically sent to the external API endpoint
6. **Real-time Updates**: New attendance data is broadcasted via Socket.IO to connected clients

### API Endpoints

#### GET `/`
Health check endpoint that returns server status.
```bash
curl http://localhost:5000/
```
Response: `Server Working Successfully`

### WebSocket Events

The server emits the following Socket.IO events:

- **`attendanceData`**: Emitted when new attendance data is fetched from the device
  ```javascript
  socket.on('attendanceData', (data) => {
    console.log('New attendance data:', data);
  });
  ```

### Database Schema

Each attendance record contains:
```javascript
{
  student_id: String,        // Student/User ID from biometric device
  in_time: String,          // Check-in time (YYYY-MM-DD HH:mm:ss)
  out_time: String,         // Check-out time (YYYY-MM-DD HH:mm:ss)
  machine_no: String,       // Machine identifier
  date: String,             // Date in YYYY-MM-DD format
  attendance_type: String,  // Type of attendance (e.g., "machine")
  attendance_status: String, // Status (e.g., "present")
  school_code: String,      // School identifier
  created_at: String,       // ISO timestamp
  updated_at: String        // ISO timestamp
}
```

## ⚙️ Configuration

### Device Configuration

Update the device connection parameters in `index.js`:
```javascript
let obj = new ZKHLIB("192.168.0.58", 4370, 5200, 5000);
// Parameters: IP, Port, Timeout, Connection Timeout
```

### Sync Interval

The system fetches data every 30 seconds by default. To change this, modify:
```javascript
setInterval(fetchAndInsertData, 30000); // 30000ms = 30 seconds
```

### API Endpoint

Update the external API endpoint in the `sendAttendanceToAPI` function:
```javascript
const response = await axios.post(
  "https://academichelperbd.com/api/create-attendance",
  dataToSend
);
```

## 🔒 Security Notes

⚠️ **Important**: The current implementation has a hardcoded MongoDB connection string. For production use:
- Move the MongoDB URI to environment variables
- Use secure authentication methods
- Implement proper error handling and logging
- Add rate limiting and authentication for API endpoints

## 📝 Project Structure

```
attendance/
├── index.js              # Main application file
├── package.json          # Dependencies and scripts
├── package-lock.json     # Locked dependency versions
├── .env                  # Environment variables (create this)
└── README.md            # This file
```

## 🐛 Troubleshooting

### Connection Issues
- **Device not found**: Verify the device IP address and ensure it's on the same network
- **Port issues**: Check if ports 4370, 5200, and 5000 are accessible
- **Firewall**: Ensure firewall allows connections to the device

### Database Issues
- **Connection failed**: Verify MongoDB connection string in `.env`
- **Authentication error**: Check MongoDB credentials and network access

### API Sync Issues
- **API errors**: Check network connectivity and API endpoint availability
- **Data format**: Verify the API expects the data format being sent

## 📄 License

ISC

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues and questions, please open an issue in the repository.

---

**Note**: Make sure your biometric device is properly configured and accessible on the network before running the application.

