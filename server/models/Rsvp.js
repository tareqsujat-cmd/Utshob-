import mongoose from 'mongoose';

// A guest's answer to an invitation. Guests don't need an account.
// The unique index (event + phone) means answering again UPDATES the answer instead of adding one.
const rsvpSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    guestName: { type: String, required: true, trim: true },
    contact: { type: String, required: true }, // normalized phone: 01XXXXXXXXX
    response: { type: String, enum: ['yes', 'no', 'maybe'], required: true },
    partySize: { type: Number, default: 1, min: 1, max: 20 }, // people including the guest
    dietaryNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

rsvpSchema.index({ event: 1, contact: 1 }, { unique: true });

export const Rsvp = mongoose.model('Rsvp', rsvpSchema);
