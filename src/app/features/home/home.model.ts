export interface HomeFilters {
  searchTerm?: string;
  selectedPurpose?: string;
  selectedPlace?: string;
  selectedDate?: string;
}

export interface PopularItem {
  name: string;
  count: number;
  trending?: boolean;
}

export interface HomeStats {
  totalHangouts: number;
  activeUsers: number;
  upcomingEvents: number;
  popularPurposes: PopularItem[];
  popularPlaces: PopularItem[];
}