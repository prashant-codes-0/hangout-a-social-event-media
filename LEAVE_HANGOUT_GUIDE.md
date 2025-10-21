# 🚪 Leave Hangout System Guide

## 🎯 **New Leave Hangout Feature**

Users can now leave hangouts they've joined, with complete cleanup of their participation.

## 🔧 **How It Works**

### **Leave Hangout Endpoint:**
```http
POST /hangouts/:id/leave
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource created successfully",
  "data": {
    "message": "Successfully left the hangout",
    "hangoutId": "507f1f77bcf86cd799439011",
    "hangoutTitle": "Networking Night",
    "remainingAttendees": 4
  }
}
```

## 🧹 **What Happens When You Leave**

### **1. Attendees Array Updated**
- User is removed from `hangout.attendees[]`
- Attendee count decreases
- Capacity becomes available for others

### **2. Join Requests Cleaned Up**
- All join requests for that user/hangout are deleted
- No orphaned data left in the system
- Clean database state maintained

### **3. Validation Checks**
- ✅ Hangout must exist
- ✅ User must be an attendee
- ❌ Can't leave if not joined

## 📊 **User Hangout Management**

### **View Your Hangouts:**

#### **1. Hangouts You Created:**
```http
GET /hangouts/my-hangouts
Authorization: Bearer YOUR_JWT_TOKEN
```

#### **2. Hangouts You Joined:**
```http
GET /hangouts/joined-hangouts
Authorization: Bearer YOUR_JWT_TOKEN
```

**Shows hangouts where:**
- You're an attendee
- You didn't create them
- Sorted by upcoming events first

## 🧪 **Complete User Journey**

### **1. Join a Hangout:**
```http
# Request to join
POST /hangouts/HANGOUT_ID/join
Authorization: Bearer YOUR_JWT_TOKEN

# Organizer approves
PATCH /hangouts/requests/REQUEST_ID
Authorization: Bearer ORGANIZER_JWT_TOKEN
{
  "status": "approved"
}
```

### **2. Check Your Joined Hangouts:**
```http
GET /hangouts/joined-hangouts
Authorization: Bearer YOUR_JWT_TOKEN
```

### **3. Leave the Hangout:**
```http
POST /hangouts/HANGOUT_ID/leave
Authorization: Bearer YOUR_JWT_TOKEN
```

### **4. Verify You've Left:**
```http
# Check joined hangouts (should be empty or missing the hangout)
GET /hangouts/joined-hangouts
Authorization: Bearer YOUR_JWT_TOKEN

# Check hangout details (you should not be in attendees)
GET /hangouts/HANGOUT_ID
```

## 🔐 **Security & Validation**

### **Authentication Required:**
- Must be logged in to leave hangouts
- Only affects your own participation

### **Validation Rules:**
- **Hangout exists:** Returns 404 if hangout not found
- **User is attendee:** Returns 400 if not an attendee
- **Clean removal:** Ensures complete data cleanup

### **Error Responses:**

#### **Not an Attendee:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "You are not an attendee of this hangout",
  "error": "Bad Request"
}
```

#### **Hangout Not Found:**
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Hangout not found",
  "error": "Not Found"
}
```

## 🎨 **Frontend Integration**

### **Leave Button Component:**
```javascript
function LeaveButton({ hangout, onLeave }) {
  const handleLeave = async () => {
    const confirmed = confirm(`Leave "${hangout.title}"?`);
    if (confirmed) {
      await onLeave(hangout._id);
    }
  };

  return (
    <button onClick={handleLeave} className="leave-btn">
      🚪 Leave Hangout
    </button>
  );
}
```

### **Leave Function:**
```javascript
async function leaveHangout(hangoutId) {
  const response = await fetch(`/hangouts/${hangoutId}/leave`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log(`Left hangout: ${result.data.hangoutTitle}`);
    console.log(`Remaining attendees: ${result.data.remainingAttendees}`);
    // Refresh hangout list or redirect
  }
}
```

## 📋 **Database Impact**

### **Before Leaving:**
```javascript
// Hangout document
{
  _id: "hangout123",
  title: "Networking Night",
  attendees: ["user1", "user2", "user3"], // ← User is here
  capacity: 10
}

// Join request document
{
  _id: "request123",
  hangoutId: "hangout123",
  userId: "user2", // ← User's request exists
  status: "approved"
}
```

### **After Leaving:**
```javascript
// Hangout document
{
  _id: "hangout123", 
  title: "Networking Night",
  attendees: ["user1", "user3"], // ← User removed
  capacity: 10
}

// Join request document - DELETED
// No orphaned data remains
```

## 🎯 **Use Cases**

### **For Users:**
- **Change of plans:** Can't attend anymore
- **Better option found:** Want to join different hangout
- **Capacity management:** Free up space for others
- **Privacy:** Remove participation history

### **For Organizers:**
- **Accurate headcount:** Real attendee numbers
- **Capacity planning:** Know actual availability
- **Communication:** Contact only active attendees

### **For System:**
- **Data integrity:** No orphaned records
- **Performance:** Clean database queries
- **Consistency:** Accurate attendee counts

## 🚀 **Benefits**

1. **Complete Cleanup** - Removes all traces of participation
2. **User Control** - Users manage their own hangout participation
3. **Data Integrity** - No orphaned join requests or inconsistent data
4. **Capacity Management** - Frees up space for other users
5. **Privacy** - Users can remove their participation history

**Users now have full control over their hangout participation with clean leave functionality! 🎉**