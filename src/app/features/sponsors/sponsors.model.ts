export interface SponsorStats {
  totalSponsoredHangouts: number;
  activeCampaigns: number;
  totalViews: number;
  totalClicks: number;
  totalAttendees: number;
  conversionRate: number;
  totalSpent: number;
  averageCostPerAttendee: number;
}

export interface SponsoredHangout {
  _id: string;
  title: string;
  description: string;
  purpose: string;
  place: string;
  time: string;
  capacity: number;
  sponsored: true;
  sponsorshipLevel: 'basic' | 'premium' | 'featured';
  budget: number;
  targetAudience: string[];
  brandingOptions: {
    logo?: string;
    primaryColor?: string;
    customMessage?: string;
  };
  analytics: {
    views: number;
    clicks: number;
    attendees: number;
    blasts: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateSponsoredHangoutDto {
  title: string;
  description: string;
  purpose: string;
  place: string;
  time: string;
  capacity: number;
  sponsorshipLevel: 'basic' | 'premium' | 'featured';
  budget: number;
  targetAudience: string[];
  brandingOptions?: {
    logo?: string;
    primaryColor?: string;
    customMessage?: string;
  };
}

export interface CampaignAnalytics {
  hangoutId: string;
  title: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    impressions: number;
    clicks: number;
    clickThroughRate: number;
    attendees: number;
    conversionRate: number;
    cost: number;
    costPerClick: number;
    costPerAttendee: number;
  };
  demographics: {
    ageGroups: { [key: string]: number };
    locations: { [key: string]: number };
    interests: { [key: string]: number };
  };
  timeline: {
    date: string;
    impressions: number;
    clicks: number;
    attendees: number;
  }[];
}

export interface SponsorshipPlan {
  name: 'basic' | 'premium' | 'featured';
  price: number;
  features: string[];
  maxHangouts: number;
  analyticsLevel: 'basic' | 'advanced' | 'premium';
  supportLevel: 'email' | 'priority' | 'dedicated';
}