import { load } from 'cheerio';

async function run() {
    const url = 'https://www.facebook.com/share/r/1GCo2k8mPB/';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36' }});
    const html = await res.text();
    const $ = load(html);
    const scriptsSet = $('script').map((i, el) => $(el).html()).get();
    const targetUrl = res.url;
    const extractedId = '1631158567973065';
    console.log('Extracted ID:', extractedId);
    
    for (const script of scriptsSet) {
        if (!script || !script.includes(extractedId)) continue;
        
        let pos = script.indexOf(extractedId);
        if (pos !== -1) {
            console.log('Found script length:', script.length);
            const matches = [...script.matchAll(/"(?:base_url|playable_url|playable_url_quality_hd|browser_native_hd_url|browser_native_sd_url|audio_url)":"([^"]+)"/g)];
            for (const m of matches) {
                let start = script.lastIndexOf('{', m.index);
                let end = script.indexOf('}', m.index);
                if (start === -1) start = Math.max(0, m.index! - 500);
                if (end === -1) end = Math.min(script.length, m.index! + 500);
                const context = script.substring(start, end);
                
                const mimeMatch = context.match(/"mime_type":"([^"]+)"/);
                const hMatch = context.match(/"height":(\d+)/);
                const typeLabel = m[0].split('"')[1];
                
                console.log('--- MATCH ---');
                console.log('Label:', typeLabel);
                console.log('Mime:', mimeMatch?.[1]);
                console.log('Height:', hMatch?.[1]);
                console.log('Context size:', context.length);
                console.log('Context:', context);
            }
        }
    }
}
run();