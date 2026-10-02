import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum HangoutLocationType {
  PLACE = 'place', // a single place, address or landmark
  ROUTE = 'route', // a path from one point to another
}

export enum TravelMode {
  DRIVING = 'driving',
  WALKING = 'walking',
  CYCLING = 'cycling',
}

@Schema({ _id: false })
export class GeoPoint {
  @Prop({ required: true })
  lat: number;

  @Prop({ required: true })
  lng: number;

  // Short name, e.g. "Patan Durbar Square"
  @Prop()
  name?: string;

  // Full address from OpenStreetMap
  @Prop()
  address?: string;
}

export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);

// Map location picked from OpenStreetMap when creating a hangout
@Schema({ _id: false })
export class HangoutLocation {
  @Prop({ required: true, enum: Object.values(HangoutLocationType) })
  type: HangoutLocationType;

  // Display label, e.g. "Patan Durbar Square" or "Thamel → Nagarkot"
  @Prop({ required: true })
  name: string;

  // type === 'place'
  @Prop({ type: GeoPointSchema })
  point?: GeoPoint;

  // type === 'route'
  @Prop({ type: GeoPointSchema })
  from?: GeoPoint;

  @Prop({ type: GeoPointSchema })
  to?: GeoPoint;

  // Route line as [lat, lng] pairs
  @Prop({ type: [[Number]], default: undefined })
  path?: number[][];

  @Prop()
  distanceMeters?: number;

  @Prop()
  durationSeconds?: number;

  @Prop({ enum: Object.values(TravelMode) })
  travelMode?: TravelMode;
}

export const HangoutLocationSchema = SchemaFactory.createForClass(HangoutLocation);
