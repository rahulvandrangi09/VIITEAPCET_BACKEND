// utils/ist.js
// Patch Date.now globally so the application uses IST (+05:30) as 'current time'.
// This affects `Date.now()` and `new Date()` (when called without args).

const originalNow = Date.now.bind(Date);
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 5 hours 30 minutes in ms

Date.now = function patchedNow() {
  return originalNow() + IST_OFFSET_MS;
};

// Convenience helpers in case code wants an explicit IST Date object or offset value
module.exports = {
  now: () => new Date(Date.now()),
  IST_OFFSET_MS,
};
