/**
 * Resolves the routes that only exist once there is data in the database.
 *
 * The whole verification harness used to run against an empty profile, on a fixed list of
 * routes that all render an empty state. It reported "40/40 routes clear the bottom bar" while
 * the appointment detail — the densest screen in the app, and the one the owner actually opens
 * — had 457px of content sitting under the navigation, unreachable. It had never been visited.
 *
 * An empty screen is the easy case. These are the hard ones.
 */

/** Reads real record ids out of IndexedDB, in the page. */
export async function resolveDataRoutes(page) {
  const ids = await page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('kate-lisi-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const all = (db, store) =>
      db.objectStoreNames.contains(store)
        ? new Promise((resolve) => {
            const request = db.transaction(store).objectStore(store).getAll();
            request.onsuccess = () => resolve(request.result);
          })
        : Promise.resolve([]);

    const db = await open();
    const appointments = await all(db, 'appointments');
    const clients = await all(db, 'clients');
    // The busiest day is the interesting one: several entries in one cell, several in the panel.
    const byDay = new Map();
    for (const appointment of appointments) {
      const key = String(appointment.startAt).slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      appointmentId: appointments[0]?.id,
      clientId: clients[0]?.id,
      busiestDay: busiest?.[0],
      appointments: appointments.length,
    };
  });

  if (!ids.appointmentId || !ids.clientId) return { routes: [], ids };

  return {
    ids,
    routes: [
      `#/calendar/${ids.appointmentId}`,
      `#/calendar/${ids.appointmentId}/edit`,
      `#/clients/${ids.clientId}`,
      `#/money/${ids.appointmentId}`,
    ],
  };
}

/**
 * Warns, loudly, when a run covered only the empty-state screens. Silence about reduced coverage
 * is what let the defect above survive a green report.
 */
export function warnIfNoData(dataRoutes, userDir) {
  if (dataRoutes.length) return false;
  console.log(
    '\n!! NO DATA ROUTES CHECKED. This run only saw empty screens.\n' +
      (userDir
        ? `!! USER_DIR=${userDir} holds no appointments or clients — seed it first:\n`
        : '!! Set USER_DIR to a seeded profile:\n') +
      '!!   USER_DIR=/tmp/demo node scripts/verify/seed-demo.mjs\n',
  );
  return true;
}
