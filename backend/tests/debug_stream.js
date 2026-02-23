const { spawn } = require("child_process");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "temp/yt-dlp-cache");
const clientArg = "youtube:player_client=web_safari,android_vr,tv";
const url = "https://youtu.be/hVvEISFw9w0"; // The video user tested

const args = [
  "--ignore-config",
  "--no-playlist",
  "--remote-components",
  "ejs:github",
  "--force-ipv4",
  "--no-check-certificates",
  "--socket-timeout",
  "30",
  "--retries",
  "3",
  "--no-colors",
  "--extractor-args",
  `${clientArg}`,
  "--cache-dir",
  CACHE_DIR,
  "--newline",
  "--progress",
  "--progress-template",
  "[download] %(progress._percent_str)s",
  "--no-part",
  "-o",
  "-",
  url,
];

console.log(`Running: yt-dlp ${args.join(" ")}`);

const p = spawn("yt-dlp", args);

p.stdout.on("data", () => {}); // Drain stdout
p.stderr.on("data", (d) => {
  console.log(`[STDERR] ${d.toString().trim()}`);
});

p.on("close", (c) => console.log(`Closed with ${c}`));

// Run for 10 seconds then kill
setTimeout(() => {
  console.log("Killing...");
  p.kill();
}, 10000);
