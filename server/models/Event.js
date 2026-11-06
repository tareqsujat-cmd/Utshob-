import mongoose from 'mongoose';
import {
  EVENT_TYPES, EVENT_STATUSES, DIVISION_NAMES, REQUIRED_SERVICES, FOOD_UNITS, MENU_COURSES,
  INVITATION_PALETTES, INVITATION_FONTS, INVITATION_LAYOUTS,
} from '../config/constants.js';

// One dish on the menu and how much of it each guest needs.
// Example: Kacchi biryani, unit kg, 0.35 kg per guest, about 3 portions per kg (estimated).
const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  course: { type: String, enum: MENU_COURSES, default: 'main' },
  unit: { type: String, enum: FOOD_UNITS, required: true },
  quantityPerGuest: { type: Number, required: true, min: 0 }, // in `unit`
  portionsPerUnit: { type: Number, default: 1, min: 0 }, // conversion to portions; an ESTIMATE unless unit is 'portion'
});

const eventSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Everyone who may manage the event, owner included (limit: plan.limits.organizers).
    organizers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    title: { type: String, required: true, trim: true },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    location: {
      division: { type: String, enum: DIVISION_NAMES, required: true },
      district: { type: String, required: true },
      address: { type: String, default: '' },
      lat: Number,
      lng: Number,
    },
    guestCount: { type: Number, required: true, min: 1 },
    budgetTotal: { type: Number, required: true, min: 0 }, // BDT
    menu: [menuItemSchema],
    dietary: [{ _id: false, label: String, guestCount: { type: Number, min: 0 } }],
    requiredServices: [{ type: String, enum: REQUIRED_SERVICES }],
    notes: { type: String, default: '' },
    status: { type: String, enum: EVENT_STATUSES, default: 'planned' },
    cancelReason: { type: String, default: '' },
    copiedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    invitation: {
      slug: String, // public address: /invite/<slug>
      heading: { type: String, default: '' },
      message: { type: String, default: '' },
      theme: {
        palette: { type: String, enum: INVITATION_PALETTES, default: 'marigold' },
        font: { type: String, enum: INVITATION_FONTS, default: 'classic' },
        layout: { type: String, enum: INVITATION_LAYOUTS, default: 'centered' },
      },
      rsvpDeadline: Date,
      isPublished: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

eventSchema.index({ owner: 1, startsAt: -1 });
eventSchema.index({ organizers: 1 });
// Unique only for events that have a slug (a partial index ignores the others).
eventSchema.index({ 'invitation.slug': 1 }, { unique: true, partialFilterExpression: { 'invitation.slug': { $type: 'string' } } });

export const Event = mongoose.model('Event', eventSchema);
