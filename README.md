# 방과후 스마트 정산 시스템

초등 방과후학교의 초3 지원금·자유수강권 지원금 정산을 계산·관리하는 웹 애플리케이션입니다. 별도 빌드 과정 없이 브라우저에서 바로 실행되는 정적(static) HTML/JS 페이지입니다.

## 실행 방법

빌드나 `npm install` 과정이 필요 없습니다. [index.html](index.html)을 브라우저로 열면 바로 실행됩니다.

- 더블클릭으로 직접 열거나
- 로컬 정적 서버(예: `npx serve .`, VS Code Live Server 등)로 열어도 됩니다.

데이터는 브라우저의 로컬 저장소(IndexedDB)에 저장되며, 상단의 "백업"/"복구" 버튼으로 JSON 파일로 내보내고 불러올 수 있습니다.

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| [index.html](index.html) | 메인 페이지, 외부 라이브러리(Bootstrap, SheetJS, ExcelJS 등) 로드 |
| [app-core.js](app-core.js) | 앱 부트스트랩 및 전역 상태 관리 |
| [app-db.js](app-db.js) | IndexedDB 기반 데이터 저장/복구 |
| [app-engine.js](app-engine.js) | 정산 계산 엔진 (상세 규칙은 [core-rules.md](core-rules.md) 참고) |
| [app-ui-steps.js](app-ui-steps.js) | 단계별(Step) 입력 화면 UI |
| [app-ui-settle.js](app-ui-settle.js) | 정산 결과 화면 UI |
| [app-ui-export.js](app-ui-export.js) | 엑셀 등 결과 내보내기 UI |
| [app-tutorial.js](app-tutorial.js) | 샌드박스/튜토리얼(가상 데이터) 기능 |
| [app-utils.js](app-utils.js) | 엑셀 처리 등 공용 유틸리티 |
| [style.css](style.css) | 스타일시트 |
| [vendor/](vendor) | Bootstrap, xlsx, ExcelJS 등 외부 라이브러리 로컬 사본 (CDN 미사용) |

## 외부 라이브러리

Bootstrap, xlsx(SheetJS), html2canvas, JSZip, ExcelJS, FileSaver는 CDN이 아니라 [vendor/](vendor) 아래 로컬 사본을 사용합니다. 학교 네트워크의 CDN 차단이나 CDN 장애로 엑셀 생성 등 핵심 기능이 멈추는 것을 막기 위함입니다. 버전을 올리려면 해당 CDN에서 새 버전을 받아 `vendor/`의 같은 경로에 덮어쓰고 [index.html](index.html)의 스크립트/링크 태그 버전 주석을 갱신하세요.

## 업데이트 공지 티커

화면 상단 띠 배너는 [updates.js](updates.js)의 `window.APP_UPDATES` 배열을 읽어서 표시합니다(구글시트 연동 아님). 새 기능을 배포할 때 이 배열에 항목을 하나 추가하면 됩니다. `<script>` 태그로 불러오는 이유는, `fetch()`로 JSON을 읽으면 `index.html`을 더블클릭으로 직접 열었을 때(파일 프로토콜) 브라우저가 로컬 파일 fetch를 막아버리기 때문입니다.

```js
{ date: '2026-07-10', message: '사용자에게 보여줄 문구', until: '2026-07-24' }
```

- `date`: 공지가 노출되기 시작하는 날짜
- `until`: 생략하면 `date`로부터 14일 후 자동으로 사라집니다. 특정 날짜까지만 보여주고 싶으면 명시하세요.
- 오래된 항목은 배열에 남겨둬도 자동으로 안 보이므로 굳이 지우지 않아도 됩니다(이력 겸용).

## 테스트

정산 계산 엔진([app-engine.js](app-engine.js))에 대한 회귀 테스트가 [test/](test)에 있습니다. Node.js 내장 테스트 러너를 사용하며 별도 설치가 필요 없습니다.

```
npm test
```

핵심 회계 규칙([core-rules.md](core-rules.md)의 헌법 1~3조: 예산 한도, 항목/강좌 우선 차감, 개별 강좌 규칙의 독립성)이 깨지지 않았는지 이 테스트로 먼저 확인한 뒤 엔진 로직을 수정하세요.

## 참고

- 학생 출석부·정산 데이터(`.xlsx`, `방과후정산_백업_*.json` 등)는 개인정보가 포함되어 있어 `.gitignore`로 저장소에서 제외됩니다.
