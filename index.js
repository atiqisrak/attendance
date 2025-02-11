const express = require("express");
const cors = require("cors");
const ZKHLIB = require("zkh-lib");
const { MongoClient, ServerApiVersion } = require("mongodb");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(express.json());

const uri =
  "mongodb+srv://attendances:PzCebmsIIcgv81JE@cluster0.nuouh7o.mongodb.net/attendances?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Function to fetch and insert data every 10 seconds
async function fetchAndInsertData() {
  let obj = new ZKHLIB("192.168.0.58", 4370, 5200, 5000);
  try {
    const attendanceCollection = client.db("attendances").collection("allLog");
    await client.connect();

    await obj.createSocket();
    const data = await obj.getAttendances(); // Assuming this function gets the attendance data

    try {
      // Insert data into MongoDB
      if (Array.isArray(data)) {
        await attendanceCollection.insertMany(data);
      } else {
        await attendanceCollection.insertOne(data);
      }
      console.log("Data successfully inserted into MongoDB");
    } catch (error) {
      console.log("Error inserting data into MongoDB:", error);
    }

    // Optionally, emit data to the client through Socket.IO (if you want real-time updates)
    io.emit("attendanceData", data);

    await obj.disconnect();
  } catch (err) {
    console.log("Error in connection:", err);
  }
}

// Set the interval to run every 10 seconds (10000 milliseconds)
setInterval(fetchAndInsertData, 10000);

app.get("/", (req, res) => {
  res.send("Server Working Successfully");
});

// Start the server with Socket.IO integration
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
