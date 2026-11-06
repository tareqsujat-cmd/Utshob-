// Food planning maths. Plain functions (no database), so they are easy to test and explain.

const round = (n) => Math.round(n * 100) / 100; // keep 2 decimals: 0.35 kg x 156 = 54.6 kg

const sameId = (a, b) => String(a) === String(b);

// For each dish: how much is needed for `attendance` guests, and how much is already covered by
// batches. Completed and started batches are LOCKED (the food exists or is cooking);
// only planned batches can still change.
export function computeFoodPlan(menu, batches, attendance) {
  return menu.map((item) => {
    const own = batches.filter((b) => sameId(b.menuItemId, item._id));
    const sumOf = (status) => round(own.filter((b) => b.status === status).reduce((s, b) => s + b.quantity, 0));

    const required = round(attendance * item.quantityPerGuest);
    const completed = sumOf('completed');
    const started = sumOf('started');
    const planned = sumOf('planned');
    const covered = round(completed + started + planned);

    return {
      menuItemId: item._id,
      name: item.name,
      unit: item.unit,
      quantityPerGuest: item.quantityPerGuest,
      required,
      completed,
      started,
      planned,
      covered,
      difference: round(required - covered), // > 0 = need more, < 0 = too much
      // Portion figures for kg/litre/piece are ESTIMATES (the UI labels them "≈ estimated").
      estimatedPortions: item.unit === 'portion' ? null : Math.round(required * item.portionsPerUnit),
    };
  });
}

// Suggest changes so that completed + started + planned ≈ required, touching PLANNED batches only.
// Returns { plan, adjustments, notes }. Nothing is saved here: the host must approve first.
//   { type: 'update', batchId, from, to }   change a planned batch's quantity
//   { type: 'cancel', batchId, from }       a planned batch is no longer needed
//   { type: 'add', menuItemId, quantity }   no planned batch to grow, so add one
export function suggestAdjustments(menu, batches, attendance) {
  const plan = computeFoodPlan(menu, batches, attendance);
  const adjustments = [];
  const notes = [];

  for (const row of plan) {
    const plannedBatches = batches
      .filter((b) => sameId(b.menuItemId, row.menuItemId) && b.status === 'planned')
      .sort((a, b) => b.quantity - a.quantity); // biggest first

    if (row.difference > 0) {
      // Need more: grow the biggest planned batch, or add a new one.
      const base = { menuItemName: row.name, unit: row.unit };
      if (plannedBatches.length > 0) {
        const batch = plannedBatches[0];
        adjustments.push({ ...base, type: 'update', batchId: batch._id, from: batch.quantity, to: round(batch.quantity + row.difference) });
      } else {
        adjustments.push({ ...base, type: 'add', menuItemId: row.menuItemId, quantity: row.difference });
      }
    } else if (row.difference < 0) {
      // Too much: shrink planned batches, biggest first. Locked batches are never touched.
      let toRemove = -row.difference;
      for (const batch of plannedBatches) {
        if (toRemove <= 0) break;
        const cut = Math.min(batch.quantity, toRemove);
        const newQuantity = round(batch.quantity - cut);
        const base = { menuItemName: row.name, unit: row.unit, batchId: batch._id, from: batch.quantity };
        adjustments.push(newQuantity === 0 ? { ...base, type: 'cancel' } : { ...base, type: 'update', to: newQuantity });
        toRemove = round(toRemove - cut);
      }
      if (toRemove > 0) {
        notes.push(
          `${row.name}: ${toRemove} ${row.unit} more than needed is already started or completed and is kept. ` +
            'Consider sharing it as surplus after the event.'
        );
      }
    }
  }
  return { attendance, plan, adjustments, notes };
}
