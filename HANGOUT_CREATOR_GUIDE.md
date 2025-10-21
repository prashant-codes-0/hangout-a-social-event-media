# 👤 Hangout Creator Tracking Guide

## 🎯 **All Ways to See Who Created Hangouts**

### **1. Get All Hangouts** - Shows Creator Info
```http
GET /hangouts
```

**Response includes creator details:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": [
    {
      "_id": "675f1234567890abcdef1234",
      "title": "Networking Night",
      "purpose": "Professional networking",
      "place": "Downtown Hotel",
      "time": "2024-12-25T19:00:00.000Z",
      "blasts": 5,
      "capacity": 20,
      "isPublic": true,
      "createdBy": {
        "_id": "675f1234567890abcdef5678",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "attendees": [],
      "createdAt": "2024-12-20T10:00:00.000Z"
    }
  ]
}
```

### **2. Get Single Hangout** - Full Creator & Attendee Details
```http
GET /hangouts/:hangoutId
```

**Response includes:**
- Creator full details
- All attendees details
- Join requests with user info

### **3. Get My Hangouts** - See What I Created ⭐ NEW
```http
GET /hangouts/my-hangouts
Authorization: Bearer YOUR_JWT_TOKEN
```

**Shows only hangouts created by the authenticated user**

### **4. Get Hangouts by User** - See What Someone Else Created ⭐ NEW
```http
GET /hangouts/by-user/:userId
```

**Shows all hangouts created by a specific user**

### **5. Admin View All Users** - See Who Can Create Hangouts
```http
GET /auth/users
Authorization: Bearer ADMIN_JWT_TOKEN
```

## 🔍 **Creator Information Available**

### **In Every Hangout Response:**
```json
{
  "createdBy": {
    "_id": "user123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "createdAt": "2024-12-20T10:00:00.000Z",
  "updatedAt": "2024-12-20T10:00:00.000Z"
}
```

### **Additional Creator Context:**
- **Role**: User's role (user/admin/sponsor)
- **Verified Status**: Whether user is verified
- **Creation Time**: When hangout was created
- **Update Time**: When hangout was last modified

## 🎨 **Use Cases**

### **For Regular Users:**
```http
# See all public hangouts with creators
GET /hangouts

# See hangouts I created
GET /hangouts/my-hangouts
Authorization: Bearer YOUR_TOKEN

# See hangouts created by a friend
GET /hangouts/by-user/FRIEND_USER_ID
```

### **For Admins:**
```http
# See all users (potential creators)
GET /auth/users
Authorization: Bearer ADMIN_TOKEN

# See hangouts by any user
GET /hangouts/by-user/ANY_USER_ID

# View all hangouts with full creator info
GET /hangouts
```

### **For Hangout Organizers:**
```http
# Check my hangouts and their status
GET /hangouts/my-hangouts
Authorization: Bearer YOUR_TOKEN

# Update my hangout
PATCH /hangouts/:id
Authorization: Bearer YOUR_TOKEN

# Handle join requests for my hangouts
PATCH /hangouts/requests/:requestId
Authorization: Bearer YOUR_TOKEN
```

## 🔐 **Permission System**

### **Who Can See What:**
- **Everyone**: Public hangouts with creator names
- **Authenticated Users**: Their own hangouts
- **Admins**: All users and all hangouts
- **Hangout Creators**: Can modify/delete their own hangouts

### **Creator Verification:**
- Only **verified users**, **admins**, and **sponsors** can create hangouts
- Creator info is always populated in responses
- Ownership is verified before allowing updates/deletions

## 🧪 **Testing Creator Tracking**

### **1. Create Test Hangouts:**
```bash
# Sign up multiple users
# Create hangouts with different users
# Check creator info in responses
```

### **2. Test Ownership:**
```bash
# Try to update someone else's hangout (should fail)
# Update your own hangout (should work)
# Check creator info remains consistent
```

### **3. Test Admin Functions:**
```bash
# Sign in as admin
# View all users
# View hangouts by specific users
# Verify users to allow hangout creation
```

## 📊 **Creator Analytics Available**

From the API responses, you can track:
- **Who creates the most hangouts**
- **When hangouts are created**
- **Which users are most active**
- **Hangout creation patterns**
- **User engagement levels**

## 🎯 **Quick Reference**

| Endpoint | Purpose | Auth Required | Shows Creator |
|----------|---------|---------------|---------------|
| `GET /hangouts` | All public hangouts | No | ✅ Name & Email |
| `GET /hangouts/:id` | Single hangout details | No | ✅ Full details |
| `GET /hangouts/my-hangouts` | My created hangouts | Yes | ✅ (You) |
| `GET /hangouts/by-user/:id` | User's hangouts | No | ✅ Full details |
| `GET /auth/users` | All users | Admin | ✅ All user info |

**Bottom Line**: You can always see who created what hangouts - the system tracks and displays creator information everywhere! 🎉