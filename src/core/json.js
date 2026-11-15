// BigInt-safe JSON (Discord snowflakes are stored as BigInt)
const replacer = (_, v) => (typeof v === "bigint" ? v.toString() : v);
const toJSON = (value) => JSON.parse(JSON.stringify(value, replacer));

module.exports = { toJSON, replacer };
