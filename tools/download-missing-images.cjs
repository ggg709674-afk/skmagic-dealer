// _missing_imgs.json 의 누락 이미지를 본사 원본 URL 에서 받아 로컬 images/ 에 저장.
// 사용: scan-missing-images.cjs 실행 후 → 레포 루트에서 `node tools/download-missing-images.cjs`
// 크롤러(playwright) 아님 — 단순 HTTP 다운로드. meta.json/products.json 손대지 않음.
// ※ 받은 .gif 가 큰 애니메이션이면(상세설명 컷) ffmpeg 로 mp4 변환 후 gif 삭제할 것.
//    변환: ffmpeg -i in.gif -movflags +faststart -pix_fmt yuv420p \
//          -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 23 -an out.mp4
//    (app.js detailImagesHtml 는 gif 참조를 같은 경로 .mp4 <video> 로 렌더함)
const fs = require('fs'), path = require('path'), https = require('https'), http = require('http');
const root = process.cwd();
const list = JSON.parse(fs.readFileSync(path.join(root, '_missing_imgs.json'), 'utf8'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function dl(url, dest, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve({ ok: false, err: 'too many redirects' });
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.skmagic.com/', 'Accept': 'image/*,*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return resolve(dl(next, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return resolve({ ok: false, err: 'HTTP ' + res.statusCode }); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.part';
      const ws = fs.createWriteStream(tmp);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(() => { fs.renameSync(tmp, dest); resolve({ ok: true, bytes: res.headers['content-length'] || '?' }); }); });
      ws.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} resolve({ ok: false, err: e.message }); });
    });
    req.on('error', (e) => resolve({ ok: false, err: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ ok: false, err: 'timeout' }); });
  });
}

(async () => {
  const CONC = 8;
  let done = 0, ok = 0, fail = 0; const fails = [];
  for (let i = 0; i < list.length; i += CONC) {
    const batch = list.slice(i, i + CONC);
    await Promise.all(batch.map(async (x) => {
      const r = await dl(x.u, x.local);
      done++;
      if (r.ok) ok++; else { fail++; fails.push({ g: x.g, u: x.u, err: r.err }); }
    }));
    process.stdout.write(`\r진행 ${done}/${list.length}  성공 ${ok}  실패 ${fail}   `);
  }
  console.log('\n완료. 성공', ok, '실패', fail);
  if (fails.length) {
    console.log('실패 목록(앞 20):');
    fails.slice(0, 20).forEach(f => console.log('  ', f.g, f.err, f.u));
    fs.writeFileSync(path.join(root, '_dl_fails.json'), JSON.stringify(fails, null, 0));
  }
})();
