import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { Notification } from '../models/Notification.js';

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
    // $group counts users per role: [{ _id: 'host', count: 3 }, ...]
    summary.usersByRole = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  }

  res.json({ summary });
}
