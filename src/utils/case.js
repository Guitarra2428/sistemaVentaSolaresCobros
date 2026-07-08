function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function rowToCamel(row) {
  if (row == null) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

function rowsToCamel(rows) {
  return rows.map(rowToCamel);
}

module.exports = { snakeToCamel, rowToCamel, rowsToCamel };
