import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { Notification } from '../models/Notification.js';
import { ProviderProfile } from '../models/ProviderProfile.js';
import { Credential } from '../models/Credential.js';
import { evaluateBookability } from '../services/provider.service.js';
import { Event } from '../models/Event.js';
import { Budget } from '../models/Budget.js';
import { Rsvp } from '../models/Rsvp.js';
import { countActiveEvents } from '../services/event.service.js';
import { totalOf } from '../services/budget.service.js';
import { getEffectivePlan } from '../services/plan.service.js';

// GET /api/dashboard: numbers for the home page cards of the logged-in user's role.
// Each feature adds its own numbers here as it is built.
export async function getDashboard(req, res) {
  const user = req.user;
  const summary = {
    unreadNotifications: await Notification.countDocuments({ user: user._id, readAt: null }),
  };

  if (user.role === 'admin') {
    summary.pendingApprovals = await User.countDocuments({ approvalStatus: 'pending' });
    summary.approvedOrganizations = await Organization.countDocuments({ approvalStatus: 'approved' });
    summary.pendingCredentials = await Credential.countDocuments({ status: 'pending' }); // M1-B
    // $group counts users per role: [{ _id: 'host', count: 3 }, ...]
    summary.usersByRole = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  }

  // M1-A: a host's events and the next one coming up
  if (user.role === 'host') {
    const plan = await getEffectivePlan(user);
    summary.events = {
      active: await countActiveEvents(user._id),
      limit: plan.limits.activeEvents,
      total: await Event.countDocuments({ organizers: user._id }),
    };
    const next = await Event.findOne({ organizers: user._id, status: { $in: ['draft', 'planned'] }, startsAt: { $gte: new Date() } })
      .sort({ startsAt: 1 })
      .select('title startsAt guestCount budgetTotal location status');
    if (next) {
      const budget = await Budget.findOne({ event: next._id, isPrimary: true });
      const rsvpYes = await Rsvp.aggregate([
        { $match: { event: next._id, response: 'yes' } },
        { $group: { _id: null, guests: { $sum: '$partySize' } } },
      ]);
      summary.nextEvent = {
        ...next.toObject(),
        estimated: budget ? totalOf(budget.lines) : 0,
        confirmedGuests: rsvpYes[0]?.guests || 0,
      };
    }
  }

  // M1-B: a provider's business status
  if (user.role === 'provider') {
    const provider = await ProviderProfile.findOne({ user: user._id });
    if (provider) {
      const credentials = await Credential.find({ provider: provider._id });
      summary.provider = {
        businessName: provider.businessName,
        bookability: evaluateBookability(provider, user, credentials),
        activePackages: provider.packages.filter((p) => !p.isArchived).length,
        pendingCredentials: credentials.filter((c) => c.status === 'pending').length,
        upcomingBlockedDates: provider.blockedDates.filter((b) => b.date >= new Date()).length,
      };
    } else {
      summary.provider = null; // no profile yet: the dashboard shows "create your profile"
    }
  }

  res.json({ summary });
}
