const express = require("express");
const cors = require("cors");
const ZKHLIB = require("zkh-lib");
const { MongoClient, ServerApiVersion } = require("mongodb");
const http = require("http");
const axios = require("axios");
const nodemon = require("nodemon");
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

async function fetchAndInsertData() {
  let obj = new ZKHLIB("192.168.0.58", 4370, 5200, 5000);
  try {
    await client.connect();
    console.log("data base connected successfully")
    const attendanceCollection = client.db("attendances").collection("allLog");

    await obj.createSocket();
    const attendanceData = await obj.getAttendances();
    const data = attendanceData.data;

    if (Array.isArray(data) && data.length > 0) {
      for (const entry of data) {
        const recordDate = new Date(entry.recordTime);
        const formattedDate = recordDate.toISOString().split("T")[0];
        const formattedTime = formatDateTime(recordDate);

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
        }
        await sendAttendanceToAPI(apiData);
      }
      console.log("Data successfully inserted/updated into MongoDB");
    }

    io.emit("attendanceData", data);
    setTimeout(() => {
      nodemon.emit("restart");
    }, 60000);
    await obj.disconnect();
  } catch (err) {
    console.log("Error in connection or data insertion:", err);
  } finally {
    await client.close();
  }
}

// fetchAndInsertData();

setInterval(fetchAndInsertData, 30000);

app.get("/", (req, res) => {
  res.send("Server Working Successfully");
});

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
