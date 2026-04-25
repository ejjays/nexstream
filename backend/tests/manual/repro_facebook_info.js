const { processVideoFormats, processAudioFormats } = require('../src/utils/format.util');

const mockFacebookInfo = {
  title: "Test Video",
  formats: [
    {"format_id": "sd", "quality": -3, "ext": "mp4", "video_ext": "mp4", "audio_ext": "none", "vbr": null, "abr": null, "tbr": null, "resolution": null},
    {"format_id": "hd", "quality": -2, "ext": "mp4", "video_ext": "mp4", "audio_ext": "none", "vbr": null, "abr": null, "tbr": null, "resolution": null}
  ]
};

console.log('Testing permissive format extraction...');
const vFormats = processVideoFormats(mockFacebookInfo);

console.log('Video Formats:', vFormats.length);
console.log(vFormats);
