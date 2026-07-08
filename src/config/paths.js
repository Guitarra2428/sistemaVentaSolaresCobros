const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

module.exports = {
  ROOT,
  PUBLIC_DIR: path.join(ROOT, "public")
};
