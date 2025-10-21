# 🌐 Global Response Format Guide

## 📋 Overview

All API responses in the Hangout App now follow a consistent, standardized format. This ensures predictable response structures across all endpoints.

## 🎯 Response Structure

### ✅ Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {
    // Actual response data here
  },
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

### ❌ Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "error": "BadRequest",
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

## 🔧 Implementation Details

### **Response Interceptor**
- Automatically wraps all successful responses
- Customizes messages based on HTTP method:
  - `POST` (201): "Resource created successfully"
  - `PUT/PATCH`: "Resource updated successfully"
  - `DELETE`: "Resource deleted successfully"
  - `GET`: "Data retrieved successfully"

### **Exception Filter**
- Handles all errors consistently
- Extracts meaningful error messages
- Handles validation errors properly
- Maintains error details while standardizing format

### **Status Codes**
- `success: true` for 2xx status codes
- `success: false` for 4xx/5xx status codes
- Original HTTP status codes preserved in `statusCode`

## 🧪 Testing Examples

### 1. **Successful User Registration**
```http
POST /auth/signup
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "verified": false
    }
  },
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

### 2. **Validation Error**
```http
POST /auth/signup
{
  "name": "",
  "email": "invalid-email",
  "password": "123"
}
```

**Response:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "name should not be empty, email must be an email, password must be longer than or equal to 6 characters",
  "error": "Bad Request",
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

### 3. **Authentication Error**
```http
POST /hangouts
Authorization: Bearer invalid-token
{
  "title": "Test Hangout",
  "purpose": "Testing",
  "place": "Test Location",
  "time": "2024-12-25T19:00:00Z"
}
```

**Response:**
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

### 4. **Successful Data Retrieval**
```http
GET /hangouts
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Networking Night",
      "purpose": "Professional networking",
      "place": "Downtown Hotel",
      "time": "2024-12-25T19:00:00.000Z",
      "blasts": 5,
      "capacity": 20,
      "isPublic": true,
      "createdBy": "507f1f77bcf86cd799439012"
    }
  ],
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

## 🎨 Benefits

1. **Consistency**: All endpoints return the same response structure
2. **Predictability**: Frontend can always expect the same format
3. **Error Handling**: Standardized error responses with meaningful messages
4. **Debugging**: Timestamps help with debugging and logging
5. **Success Indication**: Clear `success` boolean for easy status checking
6. **HTTP Compliance**: Original status codes preserved

## 🔍 Swagger Documentation

The Swagger UI at `http://localhost:3000/api` now shows:
- Consistent response examples
- Global response format documentation
- Error response structures
- Success response structures

All endpoints automatically inherit this global response format without any additional code changes!