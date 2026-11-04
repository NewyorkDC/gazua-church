# 음원 파일

여기에 파일이 있으면 합성 대신 그 음원이 재생됩니다. 없는 번호는 WebAudio 합성으로 돌아갑니다.

| 번호 | 파일명 | 현재 상태 |
|---|---|---|
| 1 | `hymn.mp3` | 없음 → 합성 (Amazing Grace 오르간) |
| 2 | `dies-irae.mp3` | **없음 → 합성** (아래 참고) |
| 3 | `toccata.mp3` | ✅ 실제 녹음 |
| 4 | `fanfare.mp3` | ✅ 실제 녹음 |

`.ogg`, `.m4a` 도 됩니다.

---

## 들어 있는 파일의 출처와 라이선스

둘 다 **미합중국 해병대 군악대(“The President’s Own” United States Marine Band)** 연주입니다.
미국 연방정부 공무 저작물이라 **퍼블릭 도메인**이고, 상업적 이용에도 제한이 없습니다.

### `toccata.mp3` — 8분 49초
- J.S. Bach, *Toccata and Fugue in D minor* (BWV 565), Nowlin 편곡
- U.S. Marine Band, 지휘 Col. Michael J. Colburn, 2012 National Concert Tour
- 출처: https://archive.org/details/ToccataAndFugue
- 라이선스: Public Domain Mark 1.0 (미국 정부 저작물)

### `fanfare.mp3` — 4분 11초
- F.W. Meacham, *American Patrol*
- U.S. Marine Band (2018)
- 출처: https://archive.org/details/american-patrol-meacham-united-states-marine-band-2018
- 라이선스: Public Domain Mark 1.0 (미국 정부 저작물)

원본에서 96kbps 로 다시 인코딩해 용량만 줄였습니다(12MB → 6.1MB, 6MB → 2.9MB).

---

## 2번(진노의 날)이 비어 있는 이유

베르디 레퀴엠 *Dies irae* 의 **쓸 수 있는 녹음을 못 찾았습니다.**

- 악보(1874)는 퍼블릭 도메인이지만 **연주 녹음은 별개 권리**입니다
- Archive.org 의 `VERDIRequiem-NEWTRANSFER_201404` 는 **CC BY-NC** — 이 사이트는 광고를 달았으므로 비영리 조건을 못 지킵니다
- `bach-toccata-and-fugue-in-d-minor` 처럼 **개인 업로더가 PD 딱지를 잘못 붙인 상용 음반**(Karl Richter / DG, 1970)이 섞여 있어 그대로 쓰면 위험합니다
- 1929년 이전 78rpm 중에는 *Ingemisco*(테너 독창)만 있고 Dies irae 합창은 없습니다

그래서 2번은 합성으로 뒀습니다. 쓸 만한 걸 구하면 `dies-irae.mp3` 로 넣기만 하면 됩니다.

**고를 때 기준:** `Public Domain` / `CC0` / `CC BY` 만. **`CC BY-NC`(비영리)는 광고가 붙은 이상 쓸 수 없습니다.**
