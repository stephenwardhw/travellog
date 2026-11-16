import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from './index.ts';
import { bookings, events, trips, tripShares, users } from './schema.ts';

export type TripAccessRole = 'owner' | 'edit' | 'view';

export interface AccessibleTripRow {
  id: number;
  clientId: string;
  userId: number;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  updatedAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
  accessRole: TripAccessRole;
  ownerName: string;
  ownerEmail: string;
}

export async function getTripAccessForTripRow(
  trip: typeof trips.$inferSelect,
  userId: number
): Promise<TripAccessRole | null> {
  if (trip.userId === userId) {
    return 'owner';
  }
  const [share] = await db
    .select({ permission: tripShares.permission })
    .from(tripShares)
    .where(and(eq(tripShares.tripId, trip.id), eq(tripShares.userId, userId)))
    .limit(1);

  if (!share) return null;
  return share.permission === 'edit' ? 'edit' : 'view';
}

export async function getTripAccessByClientId(
  tripClientId: string,
  userId: number
): Promise<{ trip: typeof trips.$inferSelect; role: TripAccessRole } | null> {
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.clientId, tripClientId))
    .limit(1);

  if (!trip) return null;
  const role = await getTripAccessForTripRow(trip, userId);
  if (!role) return null;
  return { trip, role };
}

export async function getEventAccessByClientId(
  eventClientId: string,
  userId: number
): Promise<{
  event: typeof events.$inferSelect;
  trip: typeof trips.$inferSelect;
  role: TripAccessRole;
} | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.clientId, eventClientId))
    .limit(1);

  if (!event) return null;
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, event.tripId))
    .limit(1);

  if (!trip) return null;
  const role = await getTripAccessForTripRow(trip, userId);
  if (!role) return null;
  return { event, trip, role };
}

export async function getBookingAccessByClientId(
  bookingClientId: string,
  userId: number
): Promise<{
  booking: typeof bookings.$inferSelect;
  trip: typeof trips.$inferSelect;
  role: TripAccessRole;
} | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.clientId, bookingClientId))
    .limit(1);

  if (!booking) return null;
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, booking.tripId))
    .limit(1);

  if (!trip) return null;
  const role = await getTripAccessForTripRow(trip, userId);
  if (!role) return null;
  return { booking, trip, role };
}

export async function getAccessibleTripsForUser(userId: number): Promise<AccessibleTripRow[]> {
  const ownedRows = await db
    .select({
      trip: trips,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(trips)
    .innerJoin(users, eq(trips.userId, users.id))
    .where(eq(trips.userId, userId));

  const sharedRows = await db
    .select({
      trip: trips,
      permission: tripShares.permission,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(tripShares)
    .innerJoin(trips, eq(tripShares.tripId, trips.id))
    .innerJoin(users, eq(trips.userId, users.id))
    .where(eq(tripShares.userId, userId));

  const map = new Map<number, AccessibleTripRow>();
  for (const row of ownedRows) {
    map.set(row.trip.id, {
      ...row.trip,
      accessRole: 'owner',
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
    });
  }
  for (const row of sharedRows) {
    if (map.has(row.trip.id)) continue;
    map.set(row.trip.id, {
      ...row.trip,
      accessRole: row.permission === 'edit' ? 'edit' : 'view',
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
    });
  }

  return Array.from(map.values());
}

export async function listShareableUsers(excludeUserId: number) {
  return db
    .select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(ne(users.id, excludeUserId))
    .orderBy(asc(users.email));
}

export async function listTripShares(tripId: number) {
  return db
    .select({
      id: tripShares.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      permission: tripShares.permission,
      createdAt: tripShares.createdAt,
    })
    .from(tripShares)
    .innerJoin(users, eq(tripShares.userId, users.id))
    .where(eq(tripShares.tripId, tripId))
    .orderBy(asc(users.email));
}
