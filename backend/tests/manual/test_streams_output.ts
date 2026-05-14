
import { getVideoInfo } from "../../src/services/ytdlp/info.js";
import { formatSize, getQualityLabel } from "../../../frontend/src/lib/utils.js";

async function test() {
    const url = "https://youtu.be/nTbA7qrEsP0";
    console.log(`Fetching info for: ${url}`);
    
    try {
        const info = await getVideoInfo(url);
        console.log(`Title: ${info.title}`);
        
        console.log("\nAvailable Video Streams:");
        if (info.formats) {
            info.formats.forEach((f: any) => {
                const quality = getQualityLabel(f.quality || f.resolution);
                const fps = f.fps ? `${f.fps}fps` : "";
                const size = formatSize(f.filesize);
                const format = (f.extension || f.ext || "RAW").toUpperCase();
                
                console.log(`- ${quality} ${fps} | ${size} | ${format} (ID: ${f.format_id})`);
            });
        } else {
            console.log("No video formats found.");
        }

        console.log("\nAvailable Audio Streams:");
        if (info.audioFormats) {
            info.audioFormats.forEach((f: any) => {
                const quality = f.quality;
                const size = formatSize(f.filesize);
                const format = (f.extension || f.ext || "RAW").toUpperCase();
                
                console.log(`- ${quality} | ${size} | ${format} (ID: ${f.format_id})`);
            });
        } else {
            console.log("No audio formats found.");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

test();
