export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'sponsor';
  verified: boolean;
}

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    user: AuthUser;
  };
  message: string;
}

export interface SignUpDto {
  name: string;
  email: string;
  password: string;
}

export interface SignInDto {
  email: string;
  password: string;
}