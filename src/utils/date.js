function toYmd(input) {
  if (!input) return null;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  const s = String(input);
  return s.slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(input, days) {
  const base = toYmd(input);
  if (!base) throw new Error("addDays: fecha inválida");
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const a = new Date(`${toYmd(start)}T00:00:00Z`);
  const b = new Date(`${toYmd(end)}T00:00:00Z`);
  return Math.floor((b - a) / 86400000);
}

module.exports = { today, addDays, daysBetween, toYmd };
