# tools — 누락 이미지 보강 절차

본사가 주는 상세/메인 이미지 중 우리 repo `products/G*/images/` 에 빠진 컷을
우리 서버(repo→Vercel)에 저장하는 도구. **본사 핫링크는 안 함.**

## 새 제품 추가 후 빠진 이미지 채우기

레포 루트에서:

```bash
# 1) 무엇이 빠졌는지 스캔 → _missing_imgs.json 생성
node tools/scan-missing-images.cjs

# 2) 본사 원본 URL에서 받아 products/G*/images/ 에 저장
node tools/download-missing-images.cjs

# 3) (받은 .gif 가 큰 애니메이션 상세컷이면) ffmpeg 로 mp4 변환 후 gif 삭제
#    gif는 용량이 커서(개당 3MB, 최대 34MB) 그대로 커밋하면 안 됨 → mp4 변환(약 87% 감소)
ffmpeg -i in.gif -movflags +faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 23 -an out.mp4
```

`app.js` 의 detailImagesHtml 은 `.gif` 참조를 **같은 경로의 `.mp4`** 를
`<video autoplay loop muted playsinline>` 로 렌더하므로, gif → mp4 변환만 해두면 됨.

## 참고
- gif → mp4 일괄 변환 예 (PowerShell 7, 병렬 6): WORKLOG 2026-06-01 (11) 참조.
- 썸네일(`products/G*/thumb.png`)은 `data/products.json` 의 `thumb` URL 에서 받음 — WORKLOG (12) 참조.
- 임시 산출물 `_missing_imgs.json` / `_dl_fails.json` 은 커밋 안 함(.gitignore 권장).
