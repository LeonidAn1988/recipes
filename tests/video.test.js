// Проверка разбора ссылок на видео (YouTube, Rutube, VK).
// Запуск: node tests/video.test.js
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "js", "recipesUi.js"), "utf8");
eval(src.slice(src.indexOf("function extractVideoUrl"), src.indexOf("function renderVideo")));

const cases = [
  ["https://youtu.be/abc123XYZ_-", "https://www.youtube.com/embed/abc123XYZ_-"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
  ["https://youtube.com/shorts/xyz987", "https://www.youtube.com/embed/xyz987"],
  ["https://rutube.ru/video/0123456789abcdef0123456789abcdef/", "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef/"],
  ["https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=KeY-1_2", "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef/?p=KeY-1_2"],
  ["https://vk.com/video-12345_67890", "https://vk.com/video_ext.php?oid=-12345&id=67890&hd=2"],
  ["https://vkvideo.ru/video-12345_67890?list=x", "https://vk.com/video_ext.php?oid=-12345&id=67890&hd=2"],
  ['<iframe src="https://vk.com/video_ext.php?oid=-12345&id=67890&hash=abc"></iframe>', "https://vk.com/video_ext.php?oid=-12345&id=67890&hash=abc"],
  ["https://disk.yandex.ru/i/abc", null]
];
let fails = 0;
for (const [input, expected] of cases) {
  const got = videoEmbedUrl(input);
  const ok = got === expected;
  if (!ok) fails++;
  console.log((ok ? "OK   " : "FAIL ") + input.slice(0, 70) + (ok ? "" : ` → ${got}, ожидалось ${expected}`));
}
console.log(fails ? `\n${fails} ПРОВАЛЕНО` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
