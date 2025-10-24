export interface AdminStats {
  totalUsers: number;
  totalHangouts: number;
  activeHangouts: number;
  pendingApprovals: number;
  totalBlasts: number;
  newUsersThisWeek: number;
  newHangoutsThisWeek: number;
  reportedContent: number;
}

export interface UserManagement {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'sponsor';
  verified: boolean;
  banned: boolean;
  createdAt: string;
  lastLogin: string;
  hangoutsCreated: number;
  hangoutsJoined: number;
}

export interface HangoutModeration {
  _id: string;
  title: string;
  description: string;
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  reportCount: number;
  createdAt: string;
  flaggedReason?: string;
}

export interface SystemLog {
  _id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  userId?: string;
  action: string;
  timestamp: string;
  metadata?: any;
}

export interface AdminAction {
  type: 'user_ban' | 'user_unban' | 'hangout_delete' | 'role_change';
  targetId: string;
  reason: string;
  performedBy: string;
  timestamp: string;
}