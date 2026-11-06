// Sidebar links, grouped into sections. `roles: 'all'` = every logged-in user.
// Each feature adds its links here only once its pages exist, so there are no dead links.
export const NAV_ITEMS = [
  { section: 'General', to: '/', label: 'Overview', icon: 'home', roles: 'all', end: true },

  // Plan an event (hosts)
  { section: 'Plan', to: '/events', label: 'My events', icon: 'calendar', roles: ['host'] },
  { section: 'Plan', to: '/events', label: 'All events', icon: 'calendar', roles: ['admin'] },
  { section: 'Plan', to: '/providers/search', label: 'Find providers', icon: 'search', roles: ['host', 'admin'] }, // M2-B
  { section: 'Plan', to: '/providers', label: 'Provider directory', icon: 'store', roles: ['host', 'admin'], end: true },

  // M1-C: share surplus (hosts, providers) / receive it (coordinators)
  { section: 'Share food', to: '/surplus/mine', label: 'My surplus', icon: 'leaf', roles: ['host', 'provider'] },
  { section: 'Food', to: '/food-requests', label: 'Food requests', icon: 'inbox', roles: ['orphanage_coordinator', 'outreach_coordinator'] },
  { section: 'Food', to: '/surplus', label: 'Available surplus', icon: 'leaf', roles: ['orphanage_coordinator', 'outreach_coordinator', 'admin'], end: true },
  // M2-C: collection logistics
  { section: 'Food', to: '/tasks', label: 'Collections', icon: 'truck', roles: ['orphanage_coordinator', 'outreach_coordinator', 'admin'] },
  { section: 'Pickups', to: '/tasks', label: 'My pickups', icon: 'truck', roles: ['volunteer'] },

  // M1-B: provider's own business
  { section: 'My business', to: '/provider/profile', label: 'Business profile', icon: 'store', roles: ['provider'] },
  { section: 'My business', to: '/provider/packages', label: 'Packages & prices', icon: 'file', roles: ['provider'] },
  { section: 'My business', to: '/provider/availability', label: 'Availability', icon: 'calendar', roles: ['provider'] },
  { section: 'My business', to: '/provider/credentials', label: 'Credentials', icon: 'shield', roles: ['provider'] },

  { section: 'Administration', to: '/admin/approvals', label: 'Approvals', icon: 'users', roles: ['admin'] },
  { section: 'Administration', to: '/admin/credentials', label: 'Credential reviews', icon: 'shield', roles: ['admin'] },
  { section: 'Administration', to: '/admin/audit', label: 'Audit log', icon: 'list', roles: ['admin'] },
  { section: 'Administration', to: '/admin/settings', label: 'Demo & settings', icon: 'sliders', roles: ['admin'] },

  { section: 'Account', to: '/profile', label: 'Profile', icon: 'user', roles: 'all' },
];

// The links one role may see, grouped as [{ section, items: [...] }] in the order above.
export function navSectionsFor(role) {
  const sections = [];
  for (const item of NAV_ITEMS) {
    if (item.roles !== 'all' && !item.roles.includes(role)) continue;
    let section = sections.find((s) => s.section === item.section);
    if (!section) {
      section = { section: item.section, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}
