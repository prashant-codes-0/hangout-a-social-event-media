# 📋 Schema Guide - Hangout App

## 🤔 **What are Schemas?**

**Schemas** are blueprints that define:
- **Structure**: What fields exist
- **Types**: What type of data (string, number, boolean, etc.)
- **Validation**: What rules the data must follow
- **Relationships**: How data connects to other data

## 🗄️ **Database Schemas (Mongoose)**

These define how data is stored in MongoDB:

### **1. User Schema**
```typescript
// Location: src/auth/schemas/user.schema.ts
{
  name: string,           // Required: User's full name
  email: string,          // Required, Unique: User's email
  passwordHash: string,   // Required: Encrypted password
  role: 'user' | 'admin' | 'sponsor',  // Default: 'user'
  verified: boolean,      // Default: false
  createdAt: Date,        // Auto-generated
  updatedAt: Date         // Auto-generated
}
```

### **2. Hangout Schema**
```typescript
// Location: src/hangouts/schemas/hangout.schema.ts
{
  title: string,          // Required: Hangout title
  purpose: string,        // Required: What's the hangout for
  place: string,          // Required: Where it happens
  time: Date,             // Required: When it happens
  sponsored: boolean,     // Default: false
  sponsorId: ObjectId,    // Optional: Reference to User
  attendees: ObjectId[],  // Array of User references
  blasts: number,         // Default: 0 (like count)
  capacity: number,       // Default: 10
  isPublic: boolean,      // Default: true
  createdBy: ObjectId,    // Required: Reference to User
  createdAt: Date,        // Auto-generated
  updatedAt: Date         // Auto-generated
}
```

### **3. JoinRequest Schema**
```typescript
// Location: src/hangouts/schemas/join-request.schema.ts
{
  hangoutId: ObjectId,    // Required: Reference to Hangout
  userId: ObjectId,       // Required: Reference to User
  status: 'pending' | 'approved' | 'rejected',  // Default: 'pending'
  createdAt: Date,        // Auto-generated
  updatedAt: Date         // Auto-generated
}
```

## 📝 **API DTOs (Data Transfer Objects)**

These define what data comes in/out of API endpoints:

### **1. Authentication DTOs**
```typescript
// Sign Up Request
SignUpDto {
  name: string,           // "John Doe"
  email: string,          // "john@example.com"
  password: string        // "password123" (min 6 chars)
}

// Sign In Request
SignInDto {
  email: string,          // "john@example.com"
  password: string        // "password123"
}

// Auth Response
AuthResponseDto {
  access_token: string,   // JWT token
  user: {
    id: string,
    name: string,
    email: string,
    role: string,
    verified: boolean
  }
}
```

### **2. Hangout DTOs**
```typescript
// Create Hangout Request
CreateHangoutDto {
  title: string,          // "Networking Night"
  purpose: string,        // "Professional networking"
  place: string,          // "Downtown Hotel"
  time: string,           // "2024-12-25T19:00:00Z"
  sponsored?: boolean,    // Optional: false
  sponsorId?: string,     // Optional: sponsor user ID
  capacity?: number,      // Optional: 20
  isPublic?: boolean      // Optional: true
}

// Update Hangout Request (all fields optional)
UpdateHangoutDto {
  title?: string,
  purpose?: string,
  place?: string,
  time?: string,
  capacity?: number,
  isPublic?: boolean
}
```

### **3. Global Response DTO**
```typescript
// All API responses use this format
ApiResponseDto {
  success: boolean,       // true/false
  statusCode: number,     // 200, 201, 400, 404, etc.
  message: string,        // "Operation completed successfully"
  data?: any,             // Actual response data (optional)
  error?: string,         // Error details (only when success: false)
  timestamp: string       // "2024-12-20T10:00:00.000Z"
}
```

## 🔗 **Relationships**

### **User → Hangouts**
- One user can create many hangouts
- `Hangout.createdBy` references `User._id`

### **User → JoinRequests**
- One user can have many join requests
- `JoinRequest.userId` references `User._id`

### **Hangout → JoinRequests**
- One hangout can have many join requests
- `JoinRequest.hangoutId` references `Hangout._id`

### **Hangout → Attendees**
- One hangout can have many attendees
- `Hangout.attendees[]` contains array of `User._id`

## 🎯 **Schema Purposes**

| Schema Type | Purpose | Example |
|-------------|---------|---------|
| **Mongoose Schema** | Database structure & validation | `User.schema.ts` |
| **Request DTO** | API input validation | `CreateHangoutDto` |
| **Response DTO** | API output format | `AuthResponseDto` |
| **Global Response** | Consistent API format | `ApiResponseDto` |

## 🧪 **Example Data Flow**

1. **User creates hangout:**
   ```
   Request: CreateHangoutDto → Validation → Hangout Schema → MongoDB
   Response: Hangout data → ApiResponseDto → Client
   ```

2. **User signs up:**
   ```
   Request: SignUpDto → Validation → User Schema → MongoDB
   Response: AuthResponseDto → ApiResponseDto → Client
   ```

## 📍 **File Locations**

```
src/
├── auth/schemas/user.schema.ts           # User database model
├── hangouts/schemas/hangout.schema.ts    # Hangout database model
├── hangouts/schemas/join-request.schema.ts # JoinRequest database model
├── auth/dto/auth.dto.ts                  # Auth request/response DTOs
├── hangouts/dto/hangout.dto.ts           # Hangout request DTOs
└── common/dto/api-response.dto.ts        # Global response format
```

**Simple Summary**: Schemas are just rules that say "this data must look like this" - some for the database, some for the API!