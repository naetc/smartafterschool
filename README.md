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

## 참고

- 학생 출석부·정산 데이터(`.xlsx`, `방과후정산_백업_*.json` 등)는 개인정보가 포함되어 있어 `.gitignore`로 저장소에서 제외됩니다.
- 현재 별도의 테스트 스위트는 없습니다.
