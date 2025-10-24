export interface ProfileData {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'sponsor';
  verified: boolean;
  profilePicture?: string;
  bio?: string;
  location?: string;
  interests?: string[];
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileDto {
  name?: string;
  email?: string;
  bio?: string;
  location?: string;
  interests?: string[];
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };
}

export interface ProfileStats {
  hangioutsCreated: number;
  hangioutsJoined: number;
  totalBlasts: number;
  memberSince: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}