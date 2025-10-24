export interface User {
  _id: string;
  name: string;
  email: string;
}

export interface RequestDetail {
  userId: string;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  requestedAt: string;
}

export interface Hangout {
  _id: string;
  title: string;
  description: string;
  purpose: string;
  place: string;
  time: string;
  capacity: number;
  isPublic: boolean;
  sponsored: boolean;
  blasts: number;
  createdBy: User;
  attendees: User[];
  requestedBy: User[]; // Users who have requested to join
  blastedBy: User[];
  userHasBlasted?: boolean;
  userHasRequested?: boolean; // Flag to indicate if current user has requested to join
  userHasJoined?: boolean; // Flag to indicate if current user has joined (is in attendees)
  isCreator?: boolean; // Flag to indicate if current user is the creator
  pendingRequestsCount?: number; // Count of pending requests
  requestDetails?: RequestDetail[]; // Detailed request information
  createdAt: string;
  updatedAt: string;
}

export interface CreateHangoutDto {
  title: string;
  description: string;
  purpose: string;
  place: string;
  time: string;
  capacity: number;
  isPublic: boolean;
  sponsored?: boolean;
}

export interface HangoutFilters {
  purpose?: string;
  place?: string;
  date?: string;
}