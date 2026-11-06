import { Event } from '../../models/Event.js';
import { Expense } from '../../models/Expense.js';
import { Contribution } from '../../models/Contribution.js';

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

// M2-A demo data: expenses, an equal split between the two families, and contributions
// (cash partly received, cash only pledged, goods partly received).
export async function seedMoney(users, events) {
  const host = users.host._id;
  const { wedding, engagement } = events;

  // ---------- Wedding reception (upcoming) ----------
  await Event.updateOne(
    { _id: wedding._id },
    { costSplit: { method: 'equal', groups: [{ name: "Bride's family" }, { name: "Groom's family" }] } }
  );
  await Expense.insertMany([
    { event: wedding._id, category: 'venue', description: 'Hall advance (Shapla Convention Hall)', amount: 20000, date: daysAgo(10), paidByName: 'Nusrat Rahman', paidByGroup: "Bride's family", createdBy: host },
    { event: wedding._id, category: 'decoration', description: 'Decoration deposit', amount: 5000, date: daysAgo(6), paidByName: 'Nusrat Rahman', paidByGroup: "Bride's family", createdBy: host },
    { event: wedding._id, category: 'other', description: 'Invitation card printing', amount: 3500, date: daysAgo(8), paidByName: 'Arman Hossain', paidByGroup: "Groom's family", createdBy: host },
    { event: wedding._id, category: 'transport', description: 'Microbus advance', amount: 2000, date: daysAgo(3), paidByName: 'Arman Hossain', paidByGroup: "Groom's family", createdBy: host },
    {
      event: wedding._id, category: 'food', description: 'Tasting session (entered twice)', amount: 1500, date: daysAgo(9),
      status: 'void', voidReason: 'Duplicate entry', createdBy: host,
    },
  ]);
  await Contribution.insertMany([
    {
      event: wedding._id, contributorName: 'Uncle Rafiq', contributorPhone: '01711300100', group: "Bride's family",
      type: 'cash', amountPledged: 20000, amountReceived: 10000, status: 'partially_received', createdBy: host,
      receipts: [{ amount: 10000, method: 'manual_cash', note: 'Handed over at home', recordedBy: host, at: daysAgo(5) }],
    },
    {
      // Only pledged: used to demonstrate paying online through the sandbox.
      event: wedding._id, contributorName: 'Cousin Mitu', contributorPhone: '01711300101', group: "Groom's family",
      type: 'cash', amountPledged: 5000, createdBy: host,
    },
    {
      event: wedding._id, contributorName: 'Aunt Shirin', group: "Bride's family", type: 'in_kind', status: 'partially_received', createdBy: host,
      inKind: { description: 'Basmati rice for the kacchi', quantity: 50, unit: 'kg', estimatedValue: 6000, receivedQuantity: 30 },
      receipts: [{ quantity: 30, method: 'in_kind', note: 'First 30 kg delivered', recordedBy: host, at: daysAgo(2) }],
    },
  ]);

  // ---------- Engagement dinner (completed): a finished money story for reports ----------
  await Event.updateOne(
    { _id: engagement._id },
    { costSplit: { method: 'equal', groups: [{ name: "Bride's family" }, { name: "Groom's family" }] } }
  );
  await Expense.insertMany([
    { event: engagement._id, category: 'food', description: 'Catering for 120 guests', amount: 42000, date: daysAgo(19), paidByGroup: "Bride's family", createdBy: host },
    { event: engagement._id, category: 'venue', description: 'Dhanmondi Lake Pavilion', amount: 30000, date: daysAgo(19), paidByGroup: "Groom's family", createdBy: host },
    { event: engagement._id, category: 'other', description: 'Flowers and sweets', amount: 6500, date: daysAgo(20), paidByGroup: "Bride's family", createdBy: host },
  ]);
  await Contribution.insertMany([
    {
      event: engagement._id, contributorName: 'Grandmother', group: "Bride's family", type: 'cash',
      amountPledged: 10000, amountReceived: 10000, status: 'received', createdBy: host,
      receipts: [{ amount: 10000, method: 'manual_cash', recordedBy: host, at: daysAgo(21) }],
    },
    {
      event: engagement._id, contributorName: 'Arman Hossain', group: "Groom's family", type: 'cash',
      amountPledged: 8000, amountReceived: 8000, status: 'received', createdBy: host,
      receipts: [{ amount: 8000, method: 'manual_cash', recordedBy: host, at: daysAgo(20) }],
    },
  ]);
}
