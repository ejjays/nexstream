import { processVideoFormats } from '../../src/utils/format.util.js';
import { VideoInfo } from '../../src/types/index.js';

const mockFacebookInfo = {
  title: "Test Video",
  formats: [
    {"format_id": "sd", "quality": -3, "ext": "mp4", "video_ext": "mp4", "audio_ext": "none", "vbr": null, "abr": null, "tbr": null, "resolution": null},
    {"format_id": "hd", "quality": -2, "ext": "mp4", "video_ext": "mp4", "audio_ext": "none", "vbr": null, "abr": null, "tbr": null, "resolution": null}
  ]
};

console.log('Testing permissive format extraction...');
// Casting to unknown then VideoInfo as it's a partial mock
const vFormats = processVideoFormats(mockFacebookInfo as unknown as VideoInfo);

console.log('Video Formats:', vFormats.length);
console.log(vFormats);
