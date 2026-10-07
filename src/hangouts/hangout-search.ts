import { BadRequestException } from '@nestjs/common';
import {
  HangoutLocation,
  HangoutLocationType,
} from './schemas/hangout-location.schema';

const EARTH_RADIUS_KM = 6378.1;

export const DEFAULT_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 500;
export const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;
const MAX_SEARCH_LENGTH = 100;

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat], GeoJSON order
}

export interface NearFilter {
  lat: number;
  lng: number;
  radiusKm: number;
}

// The point "near me" searches measure to: the place itself, or where a route starts
// (the meeting point).
export function geoFromLocation(
  location?: HangoutLocation | null,
): GeoJsonPoint | undefined {
  const point =
    location?.type === HangoutLocationType.ROUTE
      ? location.from
      : location?.point;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return undefined;
  }
  return { type: 'Point', coordinates: [point.lng, point.lat] };
}

// Great-circle distance in km
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// "$within the circle" query for the 2dsphere index
export function nearQuery(near: NearFilter) {
  return {
    $geoWithin: {
      $centerSphere: [[near.lng, near.lat], near.radiusKm / EARTH_RADIUS_KM],
    },
  };
}

// User input becomes a literal (case-insensitive) match, never a regex pattern
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsText(text: string) {
  return {
    $regex: escapeRegex(text.trim().slice(0, MAX_SEARCH_LENGTH)),
    $options: 'i',
  };
}

// "#Hiking, Coffee " → ['hiking', 'coffee']. Lowercase, no '#', unique, at most MAX_TAGS.
export function normalizeTags(input?: string[] | string | null): string[] {
  const raw = Array.isArray(input) ? input : (input ?? '').split(',');
  const tags = raw
    .map((tag) =>
      String(tag)
        .trim()
        .replace(/^#+/, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .slice(0, MAX_TAG_LENGTH),
    )
    .filter(Boolean);
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

// lat/lng/radiusKm query params → a validated near filter (or none when lat/lng are absent)
export function parseNear(params: {
  lat?: string;
  lng?: string;
  radiusKm?: string;
}): NearFilter | undefined {
  if (params.lat == null && params.lng == null) return undefined;

  const lat = Number(params.lat);
  const lng = Number(params.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new BadRequestException('lat and lng must be valid coordinates');
  }

  const radiusKm =
    params.radiusKm == null ? DEFAULT_RADIUS_KM : Number(params.radiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    throw new BadRequestException(
      `radiusKm must be between 0 and ${MAX_RADIUS_KM}`,
    );
  }
  return { lat, lng, radiusKm };
}

export function parseDate(
  value: string | undefined,
  name: string,
): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new BadRequestException(`${name} is not a valid date`);
  }
  return date;
}
