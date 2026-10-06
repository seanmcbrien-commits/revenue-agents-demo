const DAY = 24 * 60 * 60 * 1000;

export const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
export const toIso = (date) => date.toISOString().slice(0, 10);
export const addDays = (iso, n) => toIso(new Date(toDate(iso).getTime() + n * DAY));
export const daysBetween = (fromIso, toIsoStr) =>
  Math.round((toDate(toIsoStr).getTime() - toDate(fromIso).getTime()) / DAY);
