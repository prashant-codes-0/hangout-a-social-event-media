# 🏖️ Hangout App

A social event-based platform where users can discover, create, and join **hangouts** — real-world meetups organized around shared interests, venues, and sponsors.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the development server
npm run start:dev

# The API will be available at http://localhost:3000
# Swagger API documentation at http://localhost:3000/api
```

## 📚 API Documentation

**Interactive Swagger UI:** Visit `http://localhost:3000/api` after starting the server for complete API documentation with request/response examples and the ability to test endpoints directly.

### 🌐 Global Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "error": "BadRequest",
  "timestamp": "2024-12-20T10:00:00.000Z"
}
```

### Authentication

#### Sign Up
```http
POST /auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

#### Sign In
```http
POST /auth/signin
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Hangouts

#### Get All Hangouts
```http
GET /hangouts?purpose=networking&place=hotel&date=2024-12-25
```

#### Get Hangout Details
```http
GET /hangouts/:id
```

#### Create Hangout (Verified Users Only)
```http
POST /hangouts
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "Networking Night",
  "purpose": "Professional networking",
  "place": "Downtown Hotel",
  "time": "2024-12-25T19:00:00Z",
  "capacity": 20,
  "isPublic": true
}
```

#### Update Hangout
```http
PATCH /hangouts/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "Updated Title",
  "capacity": 25
}
```

#### Delete Hangout
```http
DELETE /hangouts/:id
Authorization: Bearer <jwt_token>
```

#### Request to Join
```http
POST /hangouts/:id/join
Authorization: Bearer <jwt_token>
```

#### Handle Join Request (Organizers Only)
```http
PATCH /hangouts/requests/:requestId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "status": "approved"
}
```

#### Add Blast (Like)
```http
POST /hangouts/:id/blast
```

## 🏗️ Project Structure

```
src/
├── auth/                    # Authentication module
│   ├── dto/                # Auth DTOs
│   ├── schemas/            # User schema
│   ├── auth.controller.ts  # Auth endpoints
│   ├── auth.service.ts     # Auth business logic
│   ├── auth.module.ts      # Auth module
│   ├── jwt.strategy.ts     # JWT strategy
│   └── local.strategy.ts   # Local strategy
├── hangouts/               # Hangouts module
│   ├── dto/               # Hangout DTOs
│   ├── schemas/           # Hangout & JoinRequest schemas
│   ├── hangouts.controller.ts # Hangout endpoints
│   ├── hangouts.service.ts    # Hangout business logic
│   └── hangouts.module.ts     # Hangout module
├── app.module.ts          # Main application module
└── main.ts               # Application entry point
```

## 🛠️ Tech Stack

- **Framework:** NestJS
- **Database:** MongoDB (Mongoose)
- **Authentication:** JWT + Passport
- **Validation:** class-validator
- **Language:** TypeScript

## 🎯 Features

- ✅ User authentication (signup/signin)
- ✅ JWT-based authorization
- ✅ Hangout CRUD operations
- ✅ Join request system
- ✅ Blast (like) system
- ✅ User role management
- ✅ Filtering and search
- ✅ Input validation
- ✅ **Swagger/OpenAPI documentation**
- ✅ **Interactive API testing**

## 🔧 Environment Variables

Create a `.env` file:

```env
JWT_SECRET=your-super-secret-jwt-key
PORT=3000
MONGODB_URI=mongodb://localhost:27017/hangout
```

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (running locally or MongoDB Atlas)

## 📝 User Roles

- **User:** Basic user, can browse and join hangouts (cannot create hangouts unless verified)
- **Admin:** Full access, can create hangouts and manage users
- **Sponsor:** Can create hangouts and sponsored hangouts

## 🔧 User Management

### Creating Hangouts
Only **verified users**, **admins**, and **sponsors** can create hangouts.

### Admin Functions
Admins can:
- View all users: `GET /auth/users`
- Verify users and change roles: `PATCH /auth/verify`

### Getting Started
1. **Seed the database** (creates admin and sponsor users):
   ```bash
   npm run seed
   ```

2. **Default accounts created:**
   - Admin: `admin@hangout.com` / `admin123`
   - Sponsor: `sponsor@hangout.com` / `sponsor123`

3. **Sign in as admin** to verify other users or test admin functions

## 🧩 Data Models

### User
```typescript
{
  id: string;
  name: string;
  email: string;
  role: 'user' | 'verified' | 'sponsor';
  verified: boolean;
  createdAt: Date;
}
```

### Hangout
```typescript
{
  id: string;
  title: string;
  purpose: string;
  place: string;
  time: Date;
  createdBy: string;
  sponsored: boolean;
  attendees: string[];
  blasts: number;
  capacity: number;
  isPublic: boolean;
}
```

### Join Request
```typescript
{
  id: string;
  hangoutId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
}
```