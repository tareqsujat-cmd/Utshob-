// How an event's costs are shared between groups (e.g. the bride's and the groom's family).
// Pure function: data in, numbers out.

const round = (n) => Math.round(n * 100) / 100; // to the paisa

// share       = what this group should pay (equal / percentage / custom amount)
// paidDirectly = expenses this group paid to vendors itself
// contributed = cash this group gave the organizers (received, not just pledged)
// outstanding = share - paidDirectly - contributed  (negative = paid more than its share)
export function computeSplitSummary(event, expenses, contributions) {
  const recorded = expenses.filter((e) => e.status === 'recorded');
  const total = round(recorded.reduce((sum, e) => sum + e.amount, 0));
  const { method, groups } = event.costSplit || { method: 'equal', groups: [] };
  const warnings = [];

  const shareOf = (group) => {
    if (method === 'percentage') return round((total * (group.percentage || 0)) / 100);
    if (method === 'custom') return round(group.fixedAmount || 0);
    return groups.length ? round(total / groups.length) : 0; // equal
  };

  const rows = groups.map((group) => {
    const paidDirectly = round(recorded.filter((e) => e.paidByGroup === group.name).reduce((s, e) => s + e.amount, 0));
    const contributed = round(
      contributions
        .filter((c) => c.group === group.name && c.status !== 'cancelled' && c.type !== 'in_kind')
        .reduce((s, c) => s + c.amountReceived, 0)
    );
    const share = shareOf(group);
    return { name: group.name, percentage: group.percentage, share, paidDirectly, contributed, outstanding: round(share - paidDirectly - contributed) };
  });

  if (method === 'custom') {
    const assigned = round(rows.reduce((s, r) => s + r.share, 0));
    if (assigned !== total) {
      warnings.push(`Custom amounts add up to ৳${assigned.toLocaleString('en-IN')}, but expenses now total ৳${total.toLocaleString('en-IN')}. Update the split.`);
    }
  }
  if (groups.length === 0) warnings.push('No cost groups yet. Add groups to see who owes what.');

  return { method, total, groups: rows, warnings };
}
