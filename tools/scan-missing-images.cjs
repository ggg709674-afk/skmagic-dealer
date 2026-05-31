// 누락된 상세/메인 이미지 스캔 (다운로드 X, 집계만)
// 사용: 레포 루트에서 `node tools/scan-missing-images.cjs`
//   → products/G*/meta.json 의 detail_images / main_images 참조 중
//     로컬 images/ 에 없는 것을 집계하고 _missing_imgs.json 으로 저장.
// 새 제품을 추가한 뒤 무엇이 빠졌는지 확인할 때 사용. (다음 단계: download-missing-images.cjs)
const fs = require('fs'), path = require('path');
const root = process.cwd();
const pdir = path.join(root, 'products');
const dirs = fs.readdirSync(pdir).filter(d => /^G\d+$/.test(d));

let totalRefs = 0, missing = [];
for (const g of dirs) {
  const metaP = path.join(pdir, g, 'meta.json');
  if (!fs.existsSync(metaP)) continue;
  let m;
  try { m = JSON.parse(fs.readFileSync(metaP, 'utf8')); } catch { continue; }
  const imgDir = path.join(pdir, g, 'images');

  // detail_images → detail_${i}_${fn}
  (m.detail_images || []).forEach((u, i) => {
    const fn = u.split('/').pop().split('?')[0];
    const local = path.join(imgDir, `detail_${String(i).padStart(2,'0')}_${fn}`);
    totalRefs++;
    if (!fs.existsSync(local)) missing.push({ g, kind: 'detail', i, u, local, ext: path.extname(fn).toLowerCase() });
  });
  // main_images → main_${fn}
  (m.main_images || []).forEach((u) => {
    const fn = u.split('/').pop().split('?')[0];
    const local = path.join(imgDir, `main_${fn}`);
    totalRefs++;
    if (!fs.existsSync(local)) missing.push({ g, kind: 'main', u, local, ext: path.extname(fn).toLowerCase() });
  });
}

const byExt = {};
for (const x of missing) byExt[x.ext] = (byExt[x.ext]||0)+1;
const byProd = {};
for (const x of missing) byProd[x.g] = (byProd[x.g]||0)+1;

console.log('총 이미지 참조:', totalRefs);
console.log('누락:', missing.length);
console.log('확장자별 누락:', JSON.stringify(byExt));
console.log('누락된 제품 수:', Object.keys(byProd).length, '/', dirs.length);
console.log('kind별:', JSON.stringify(missing.reduce((a,x)=>{a[x.kind]=(a[x.kind]||0)+1;return a;},{})));
console.log('샘플 5개:');
missing.slice(0,5).forEach(x => console.log('  ', x.g, x.kind, x.ext, '←', x.u));
// 다운로드용 목록 저장
fs.writeFileSync(path.join(root, '_missing_imgs.json'), JSON.stringify(missing, null, 0));
console.log('→ _missing_imgs.json 저장');
