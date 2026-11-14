import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const trips = pgTable('trips', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  destination: text('destination').notNull().default(''),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  description: text('description').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  tripClientId: text('trip_client_id').notNull(),
  tripId: integer('trip_id')
    .references(() => trips.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  eventDate: text('event_date').notNull(),
  eventTime: text('event_time').notNull().default(''),
  location: text('location').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  details: text('details').notNull().default(''),
  journalEntry: text('journal_entry').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const photos = pgTable('photos', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  eventClientId: text('event_client_id').notNull(),
  eventId: integer('event_id')
    .references(() => events.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  diskPath: text('disk_path').notNull(),
  caption: text('caption').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const pdfs = pgTable('pdfs', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  eventClientId: text('event_client_id').notNull(),
  eventId: integer('event_id')
    .references(() => events.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  diskPath: text('disk_path').notNull(),
  extractedText: text('extracted_text').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const usersRelations = relations(users, ({ many }) => ({
  trips: many(trips),
  events: many(events),
  photos: many(photos),
  pdfs: many(pdfs),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  user: one(users, {
    fields: [trips.userId],
    references: [users.id],
  }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  trip: one(trips, {
    fields: [events.tripId],
    references: [trips.id],
  }),
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  photos: many(photos),
  pdfs: many(pdfs),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  event: one(events, {
    fields: [photos.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [photos.userId],
    references: [users.id],
  }),
}));

export const pdfsRelations = relations(pdfs, ({ one }) => ({
  event: one(events, {
    fields: [pdfs.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [pdfs.userId],
    references: [users.id],
  }),
}));
