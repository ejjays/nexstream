// proot dev shim — loaded via NODE_OPTIONS --require before Metro boots.
// two proot/Termux workarounds:
//  1. os.networkInterfaces throws under proot — swallow & return {}.
//  2. proot's real inotify ceiling is ~8k watches (the 524288 in /proc/sys is a
//     proot fake). Metro's watcher adds one watch per dir & node_modules has tens
//     of thousands -> ENOSPC. skip watching under node_modules: it's still in the
//     readdir crawl/module map so resolution works, we just won't live-detect dep
//     edits (restart metro after npm install). keeps watches to src, well under 8k.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const origNetworkInterfaces = os.networkInterfaces;
os.networkInterfaces = function () {
  try {
    return origNetworkInterfaces.call(os);
  } catch {
    return {};
  }
};

const NM = path.sep + 'node_modules' + path.sep;

// inert FSWatcher stand-in — no inotify watch is spent on this path.
function inertWatcher() {
  const fake = new EventEmitter();
  fake.close = () => undefined;
  fake.ref = () => fake;
  fake.unref = () => fake;
  return fake;
}

const origWatch = fs.watch;
fs.watch = function patchedWatch(filename, ...rest) {
  const target = path.resolve(String(filename));
  if (target.includes(NM)) return inertWatcher();
  return origWatch.call(fs, filename, ...rest);
};
