// userland (proot) blocks interface enumeration
const os = require('os');

const original = os.networkInterfaces;
os.networkInterfaces = function () {
  try {
    return original.call(os);
  } catch {
    return {};
  }
};
