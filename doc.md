# Machine Attendance API Documentation

## 📋 Table of Contents

- [Overview](#overview)
- [Endpoint Details](#endpoint-details)
- [Request Payload](#request-payload)
  - [Required Fields](#required-fields)
  - [Request Example](#request-example)
- [Response Structure](#response-structure)
  - [Success Response](#success-response-200-ok)
  - [Response Fields](#response-fields)
- [Business Logic](#business-logic)
  - [User Type Detection](#user-type-detection)
  - [Attendance Processing](#attendance-processing)
  - [Status Calculation](#status-calculation)
- [Error Responses](#error-responses)
- [Example Use Cases](#example-use-cases)
- [Code Examples](#code-examples)
- [Important Notes](#important-notes)

---

## Overview

This API endpoint processes attendance records from biometric/attendance machines. It automatically determines if a user is a student or staff member, handles check-in and check-out, and calculates attendance status (present/delay) based on scheduled times.

### Quick Reference

- **Base URL:** `https://backend.academichelperbd.xyz`
- **API Version:** `v1`
- **Full Endpoint:** `https://backend.academichelperbd.xyz/api/v1/machine-attendance`
- **Method:** `POST`

---

## Endpoint Details

| Property | Value |
|----------|-------|
| **Base URL** | `https://backend.academichelperbd.xyz` |
| **API Version** | `v1` |
| **Full Endpoint** | `https://backend.academichelperbd.xyz/api/v1/machine-attendance` |
| **Method** | `POST` |
| **Authentication** | None (Public endpoint) |
| **Content-Type** | `application/json` |

---

## Request Payload

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | `number` | Unique record ID from the machine | `12345` |
| `user_id` | `string` | Student ID or Staff ID | `"STU001"` or `"STAFF001"` |
| `terminal_sn` | `string` | Terminal/Device serial number | `"TERM-12345"` |
| `user_name` | `string` | Name of the user | `"John Doe"` |
| `att_time` | `string` | Attendance timestamp (ISO format) | `"2025-12-13 09:00:00"` |
| `record_type` | `string` | Type of record (Check-in/Check-out) | `"Check-in"` or `"Check-out"` |
| `school_id` | `number` | School identifier | `1` |

### Request Example

```json
{
  "id": 12345,
  "user_id": "STU001",
  "terminal_sn": "TERM-12345",
  "user_name": "John Doe",
  "att_time": "2025-12-13 09:00:00",
  "record_type": "Check-in",
  "school_id": 1
}
```

---

## Response Structure

### Success Response (200 OK)

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Attendance recorded successfully" | "Out time updated successfully",
  "data": {
    "attendance_id": 123,
    "user_id": "STU001",
    "user_type": "student" | "staff",
    "user_name": "John Doe",
    "date": "2025-12-13",
    "in_time": "2025-12-13T09:00:00.000Z" | null,
    "out_time": "2025-12-13T17:00:00.000Z" | null,
    "status": "present" | "delay" | "absent" | "leave",
    "is_new_record": true | false,
    "is_updated": true | false
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `attendance_id` | `number` | Database ID of the attendance record |
| `user_id` | `string` | User identifier (student_id or staff_id) |
| `user_type` | `string` | Automatically determined: `"student"` or `"staff"` |
| `user_name` | `string` | Name of the user |
| `date` | `string` | Date in YYYY-MM-DD format |
| `in_time` | `string \| null` | Check-in time in ISO format |
| `out_time` | `string \| null` | Check-out time in ISO format |
| `status` | `string` | Attendance status: `"present"`, `"delay"`, `"absent"`, or `"leave"` |
| `is_new_record` | `boolean` | `true` if this is a new attendance record (check-in) |
| `is_updated` | `boolean` | `true` if existing record was updated (check-out) |

---

## Business Logic

### User Type Detection

The API automatically determines if the user is a student or staff by checking:

1. **First checks** `students` table for matching `student_id` and `school_id`
2. **If not found**, checks `staffs` table for matching `staff_id` and `school_id`
3. **Returns error** if user not found in either table

### Attendance Processing

#### First Attendance (Check-in):

- Creates a new attendance record
- Sets `in_time` to the provided `att_time`
- Determines status based on scheduled time:
  - `"present"` if attendance is on time
  - `"delay"` if attendance is after scheduled start time + delay time
- `out_time` is set to `null`

#### Subsequent Attendance (Check-out):

- Updates existing attendance record for the same date
- Sets `out_time` to the provided `att_time`
- Preserves the original status from check-in

### Status Calculation

- **For students:** Uses `attendance_schedule` table (based on `class_id`)
- **For staff:** Uses `staff_attendance_schedule` table (based on `staff_id`)

**Status is `"present"` if:**
- No scheduled time is configured, OR
- Attendance time ≤ scheduled start time + delay time

**Status is `"delay"` if:**
- Attendance time > scheduled start time + delay time

---

## Error Responses

### 400 Bad Request

```json
{
  "statusCode": 400,
  "success": false,
  "message": "Invalid attendance time format" | "Validation error message",
  "data": null
}
```

### 404 Not Found

```json
{
  "statusCode": 404,
  "success": false,
  "message": "User with ID \"STU001\" not found in students or staffs table for this school",
  "data": null
}
```

---

## Example Use Cases

### Example 1: Student Check-in (On Time)

**Request:**

```json
{
  "id": 1001,
  "user_id": "STU001",
  "terminal_sn": "TERM-001",
  "user_name": "Alice Smith",
  "att_time": "2025-12-13 08:45:00",
  "record_type": "Check-in",
  "school_id": 1
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Attendance recorded successfully",
  "data": {
    "attendance_id": 500,
    "user_id": "STU001",
    "user_type": "student",
    "user_name": "Alice Smith",
    "date": "2025-12-13",
    "in_time": "2025-12-13T08:45:00.000Z",
    "out_time": null,
    "status": "present",
    "is_new_record": true,
    "is_updated": false
  }
}
```

---

### Example 2: Student Check-out

**Request:**

```json
{
  "id": 1002,
  "user_id": "STU001",
  "terminal_sn": "TERM-001",
  "user_name": "Alice Smith",
  "att_time": "2025-12-13 15:30:00",
  "record_type": "Check-out",
  "school_id": 1
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Out time updated successfully",
  "data": {
    "attendance_id": 500,
    "user_id": "STU001",
    "user_type": "student",
    "user_name": "Alice Smith",
    "date": "2025-12-13",
    "in_time": "2025-12-13T08:45:00.000Z",
    "out_time": "2025-12-13T15:30:00.000Z",
    "status": "present",
    "is_new_record": false,
    "is_updated": true
  }
}
```

---

### Example 3: Staff Check-in (Delayed)

**Request:**

```json
{
  "id": 2001,
  "user_id": "STAFF001",
  "terminal_sn": "TERM-002",
  "user_name": "Bob Johnson",
  "att_time": "2025-12-13 09:15:00",
  "record_type": "Check-in",
  "school_id": 1
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Attendance recorded successfully",
  "data": {
    "attendance_id": 501,
    "user_id": "STAFF001",
    "user_type": "staff",
    "user_name": "Bob Johnson",
    "date": "2025-12-13",
    "in_time": "2025-12-13T09:15:00.000Z",
    "out_time": null,
    "status": "delay",
    "is_new_record": true,
    "is_updated": false
  }
}
```

---

## Code Examples

### cURL

```bash
curl -X POST https://backend.academichelperbd.xyz/api/v1/machine-attendance \
  -H "Content-Type: application/json" \
  -d '{
    "id": 12345,
    "user_id": "STU001",
    "terminal_sn": "TERM-12345",
    "user_name": "John Doe",
    "att_time": "2025-12-13 09:00:00",
    "record_type": "Check-in",
    "school_id": 1
  }'
```

### JavaScript/TypeScript (Fetch API)

```javascript
const response = await fetch('https://backend.academichelperbd.xyz/api/v1/machine-attendance', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    id: 12345,
    user_id: 'STU001',
    terminal_sn: 'TERM-12345',
    user_name: 'John Doe',
    att_time: '2025-12-13 09:00:00',
    record_type: 'Check-in',
    school_id: 1
  })
});

const data = await response.json();
console.log(data);
```

### JavaScript/TypeScript (Axios)

```javascript
import axios from 'axios';

const response = await axios.post('https://backend.academichelperbd.xyz/api/v1/machine-attendance', {
  id: 12345,
  user_id: 'STU001',
  terminal_sn: 'TERM-12345',
  user_name: 'John Doe',
  att_time: '2025-12-13 09:00:00',
  record_type: 'Check-in',
  school_id: 1
});

console.log(response.data);
```

### Python (Requests)

```python
import requests

url = 'https://backend.academichelperbd.xyz/api/v1/machine-attendance'
payload = {
    'id': 12345,
    'user_id': 'STU001',
    'terminal_sn': 'TERM-12345',
    'user_name': 'John Doe',
    'att_time': '2025-12-13 09:00:00',
    'record_type': 'Check-in',
    'school_id': 1
}

response = requests.post(url, json=payload)
data = response.json()
print(data)
```

---

## Important Notes

1. ⚠️ The API uses **database transactions** to ensure data consistency
2. 📝 The `record_type` field in the request is accepted but the API logic automatically determines check-in/check-out based on existing records
3. 🕐 All timestamps are stored and returned in **ISO 8601 format**
4. 📋 The API automatically adds a note: `"Machine attendance - Terminal: {terminal_sn}"`
5. ✅ Only **active users** (`status = 'active'`) are considered for attendance processing
6. ⏰ Time comparison is done in **minutes since midnight** for accurate delay calculation
7. 🔄 The API handles both **check-in** (new record) and **check-out** (update existing record) automatically based on date matching

---

**Last Updated:** December 2025
