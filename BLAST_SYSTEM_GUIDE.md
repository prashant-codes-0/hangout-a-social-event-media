# 🚀 Reddit-Style Blast (Upvote) System

## 🎯 **New Blast System Features**

### **✅ Reddit-Style Toggle Voting**
- **One blast per user** - prevents spam
- **Toggle functionality** - click to upvote, click again to remove
- **User tracking** - system knows who has blasted what
- **Real-time feedback** - shows your blast status

## 🔧 **How It Works**

### **1. Toggle Blast (Upvote/Downvote)**
```http
POST /hangouts/:id/blast
Authorization: Bearer YOUR_JWT_TOKEN
```

**First Click (Add Blast):**
```json
{
  "success": true,
  "data": {
    "hangoutId": "507f1f77bcf86cd799439011",
    "blasts": 6,
    "userBlasted": true,
    "action": "added"
  }
}
```

**Second Click (Remove Blast):**
```json
{
  "success": true,
  "data": {
    "hangoutId": "507f1f77bcf86cd799439011", 
    "blasts": 5,
    "userBlasted": false,
    "action": "removed"
  }
}
```

### **2. View Blast Status**

#### **Single Hangout:**
```http
GET /hangouts/:id
Authorization: Bearer YOUR_JWT_TOKEN (optional)
```

**Response includes:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "title": "Networking Night",
    "blasts": 5,
    "blastedBy": [
      {
        "_id": "user1",
        "name": "John Doe",
        "email": "john@example.com"
      }
    ],
    "userHasBlasted": true  // ← Shows if YOU have blasted it
  }
}
```

#### **All Hangouts:**
```http
GET /hangouts
Authorization: Bearer YOUR_JWT_TOKEN (optional)
```

**Each hangout includes `userHasBlasted` field if authenticated**

## 🎨 **Frontend Integration**

### **Blast Button Logic:**
```javascript
// Pseudo-code for frontend
function BlastButton({ hangout, onBlast }) {
  const isBlasted = hangout.userHasBlasted;
  
  return (
    <button 
      onClick={() => onBlast(hangout._id)}
      className={isBlasted ? 'blasted' : 'not-blasted'}
    >
      🚀 {hangout.blasts} {isBlasted ? 'Blasted' : 'Blast'}
    </button>
  );
}
```

### **Toggle Blast Function:**
```javascript
async function toggleBlast(hangoutId) {
  const response = await fetch(`/hangouts/${hangoutId}/blast`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Update UI based on result.data.action
    console.log(`Blast ${result.data.action}: ${result.data.blasts} total`);
  }
}
```

## 🧪 **Testing the System**

### **1. Create Test Hangout:**
```http
POST /hangouts
Authorization: Bearer ADMIN_JWT_TOKEN
{
  "title": "Test Blast Hangout",
  "purpose": "Testing blast system",
  "place": "Test Location",
  "time": "2024-12-25T19:00:00Z"
}
```

### **2. Test Blast Toggle:**
```http
# First blast (should add)
POST /hangouts/HANGOUT_ID/blast
Authorization: Bearer USER_JWT_TOKEN

# Second blast (should remove)  
POST /hangouts/HANGOUT_ID/blast
Authorization: Bearer USER_JWT_TOKEN

# Third blast (should add again)
POST /hangouts/HANGOUT_ID/blast
Authorization: Bearer USER_JWT_TOKEN
```

### **3. Check Blast Status:**
```http
GET /hangouts/HANGOUT_ID
Authorization: Bearer USER_JWT_TOKEN
```

**Look for:**
- `blasts`: Total blast count
- `blastedBy`: Array of users who blasted
- `userHasBlasted`: Your blast status

## 🔐 **Security Features**

### **Authentication Required:**
- Must be logged in to blast
- Anonymous users can see blast counts but can't blast

### **One Vote Per User:**
- System tracks who has blasted
- Prevents multiple blasts from same user
- Toggle functionality for changing mind

### **Data Integrity:**
- Blast count automatically calculated
- User tracking prevents manipulation
- Minimum blast count is 0 (can't go negative)

## 📊 **Database Changes**

### **New Hangout Fields:**
```typescript
{
  blasts: number,           // Total blast count
  blastedBy: ObjectId[],    // Array of user IDs who blasted
  userHasBlasted: boolean   // Added in responses (not stored)
}
```

### **Migration Note:**
Existing hangouts will have:
- `blastedBy: []` (empty array)
- Existing `blasts` count preserved

## 🎯 **Use Cases**

### **For Users:**
- **Discover popular hangouts** - high blast count indicates quality
- **Express interest** - blast hangouts you like
- **Change your mind** - toggle blast on/off anytime

### **For Organizers:**
- **Gauge interest** - see who's excited about your hangout
- **Improve events** - learn what gets more blasts
- **Build community** - blasts show engagement

### **For Admins:**
- **Monitor engagement** - track blast patterns
- **Identify popular content** - high-blast hangouts
- **User behavior** - see who's most active

## 🚀 **Benefits**

1. **Prevents Spam** - one blast per user
2. **User Engagement** - interactive voting system  
3. **Content Discovery** - popular hangouts rise to top
4. **Real-time Feedback** - instant blast status updates
5. **Reddit-like UX** - familiar upvote/downvote pattern

**The blast system now works like Reddit upvoting - users can toggle their blast on/off, and the system tracks everything! 🎉**