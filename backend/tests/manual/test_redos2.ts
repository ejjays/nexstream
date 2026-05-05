const regex3 = /FBQualityClass=\\"hd\\".*?BaseURL>(.*?)</s;
const badString3 = 'FBQualityClass=\\"hd\\"' + ' '.repeat(100000) + 'xyz';

console.time('regex3');
regex3.test(badString3);
console.timeEnd('regex3');

const regex4 = /representation_id=\\"\d+v\\".*?base_url\\":\\"(.*?)\\"/s;
const badString4 = 'representation_id=\\"123v\\"' + ' '.repeat(100000) + 'xyz';

console.time('regex4');
regex4.test(badString4);
console.timeEnd('regex4');
