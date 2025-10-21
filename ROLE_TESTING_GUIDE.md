# 🎭 Role System Testing Guide

## 🚀 Quick Setup

1. **Seed the database:**
   ```bash
   npm run seed
   ```

2. **Start the server:**
   ```bash
   npm run start:dev
   ```

3. **Open Swagger UI:**
   ```
   http://localhost:3000/api
   ```

## 👥 Test Accounts

| Role | Email | Password | Can Create Hangouts | Admin Access |
|------|-------|----------|---------------------|--------------|
| Admin | `admin@hangout.com` | `admin123` | ✅ | ✅ |
| Sponsor | `sponsor@hangout.com` | `sponsor123` | ✅ | ❌ |
| User | *Register new* | *Your choice* | ❌ (until verified) | ❌ |

## 🧪 Testing Scenarios

### 1. **Test User Registration & Hangout Creation**
```http
# 1. Register a new user
POST /auth/signup
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "password123"
}

# 2. Try to create hangout (should fail)
POST /hangouts
Authorization: Bearer USER_TOKEN
{
  "title": "Test Hangout",
  "purpose": "Testing",
  "place": "Test Location",
  "time": "2024-12-25T19:00:00Z"
}
# Expected: 403 - Only verified users, admins, and sponsors can create hangouts
```

### 2. **Test Admin Functions**
```http
# 1. Sign in as admin
POST /auth/signin
{
  "email": "admin@hangout.com",
  "password": "admin123"
}

# 2. View all users
GET /auth/users
Authorization: Bearer ADMIN_TOKEN

# 3. Verify the test user
PATCH /auth/verify
Authorization: Bearer ADMIN_TOKEN
{
  "userId": "TEST_USER_ID",
  "role": "admin"
}
```

### 3. **Test Verified User Hangout Creation**
```http
# After verification, the user can create hangouts
POST /hangouts
Authorization: Bearer VERIFIED_USER_TOKEN
{
  "title": "Now I Can Create!",
  "purpose": "Testing verified access",
  "place": "Test Location",
  "time": "2024-12-25T19:00:00Z"
}
# Expected: 201 - Success!
```

### 4. **Test Sponsor Functions**
```http
# 1. Sign in as sponsor
POST /auth/signin
{
  "email": "sponsor@hangout.com",
  "password": "sponsor123"
}

# 2. Create sponsored hangout
POST /hangouts
Authorization: Bearer SPONSOR_TOKEN
{
  "title": "Sponsored Event",
  "purpose": "Business networking",
  "place": "Premium Hotel",
  "time": "2024-12-25T19:00:00Z",
  "sponsored": true
}
# Expected: 201 - Success!

# 3. Try admin functions (should fail)
GET /auth/users
Authorization: Bearer SPONSOR_TOKEN
# Expected: 403 - Admin access required
```

## ✅ Expected Behaviors

- **Unverified Users:** Can browse, join hangouts, but cannot create them
- **Verified Users/Admins/Sponsors:** Can create hangouts
- **Admins Only:** Can view all users and verify/change user roles
- **All Authenticated Users:** Can join hangouts, add blasts, etc.

## 🔧 Role Management

To change user roles, use the admin verify endpoint:
- `"role": "user"` - Basic user (needs verification to create hangouts)
- `"role": "admin"` - Full admin access
- `"role": "sponsor"` - Can create hangouts and sponsored events