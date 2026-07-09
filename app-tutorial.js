/* ==========================================================================
   파일닉네임: app-tutorial.js
   기능설명: 튜토리얼(기본과정/심화과정) 콘텐츠 및 위젯 표시 로직
   - 기존 app-core.js의 샌드박스 스텝 로직(changeSandboxStep)을 대체/확장
   - 추후 콘텐츠(TUTORIAL_CONTENT)만 별도 파일로 분리 예정 (구조 확정 후)
   ========================================================================== */
'use strict';

// 💡 튜토리얼 콘텐츠 정의
// 각 항목: title(배지 문구), body(설명, HTML 허용), checklist(선택, 실행 체크리스트 배열)
window.TUTORIAL_CONTENT = {
    basic: [
        {
            title: '🎯 시스템 한눈에 보기',
            body: `이 시스템은 <strong>분기 / 차수</strong> 단위로 방과후 수강료를 정산합니다.<br>
                   <strong>1스텝(부서·강좌 세팅) → 2스텝(수강생 명단 관리) → 3스텝(자유수강권 관리)
                   → 4스텝(정산 마감·예외처리) → 5스텝(서식 자동생성)</strong> 순서로 진행돼요.<br><br>
                   이 시스템의 핵심은 <strong>"최소한의 값만 입력하면 나머지는 자동으로 계산"</strong>되는
                   구조라는 점이에요. 그래서 1~3스텝에서 입력하는 값 하나하나가 뒤에서 실제 금액 계산에
                   그대로 쓰입니다.`
        },
        {
            title: '🎯 상단의 분기 선택, 꼭 기억하세요',
            highlight: '#btnQTab1',
            body: `화면 상단에는 <strong>1분기 / 2분기 / 3분기 / 4분기</strong> 탭이 있어요. 여기서 고른 분기는
                   1스텝부터 5스텝까지 <strong>모든 화면에 동시에 적용</strong>됩니다. 즉 지금 2분기를 보고 있다면,
                   1스텝의 강좌 요금표도, 4스텝의 정산 내역도 전부 2분기 기준으로 표시돼요.<br><br>
                   그래서 "분명 입력했는데 안 보인다"는 대부분 <strong>분기를 잘못 보고 있는 경우</strong>예요.
                   뭔가 안 보이면 제일 먼저 상단 분기 탭부터 확인하는 습관을 들이면 좋아요.`
        },
        {
            title: '🎯 환경설정 살펴보기',
            highlight: '[onclick="openSettings()"]',
            body: `우측 상단 <strong>⚙️ 환경설정</strong> 버튼에서 바꿀 수 있는 건
                   <strong>공제 연산 유형</strong>(항목 우선 / 강좌 우선)과 초3 · 자유수강권의
                   <strong>공제 우선순위</strong>예요. 설정을 바꾸면 전체 장부가 즉시 재연산되니,
                   이미 입력해둔 데이터가 있다면 신중하게 바꿔주세요.<br><br>
                   반면 <strong>회계연도 방식(통합형 / 재료비 분리형)</strong>은 여기서 바꿀 수 없어요.
                   이건 재료비라는 항목 자체가 데이터 구조에 있는지 없는지를 결정하는 값이라, 이미 쌓인
                   회계 기록을 안전하게 바꿀 방법이 없거든요. 그래서 <strong>처음 시스템을 시작할 때(웰컴
                   화면)에만</strong> 정할 수 있고, 나중에 바꾸려면 <strong>시스템을 초기화</strong>해서
                   다시 처음부터 선택해야 합니다. 환경설정 화면의 뱃지에는 지금 어떤 방식인지 참고로만
                   표시돼요.`,
            checklist: [
                '우측 상단 ⚙️ 환경설정 메뉴 열어보기',
                '공제 연산 유형 또는 지원금 우선순위가 뭐가 있는지 훑어보기 (지금 당장 바꾸지 않아도 돼요)',
                '뱃지에 표시된 현재 회계연도 방식이 통합형인지 분리형인지 확인만 해보기'
            ]
        },
        {
            title: '🎯 1스텝 — 부서/강좌 세팅 ①: 강사료는 이렇게 계산돼요',
            tab: '#step1', highlight: '#tbMaster',
            body: `여기서 입력하는 <strong>월 강사료 / 월 수용비</strong>는 "한 달(4주) 기준" 금액이고,
                   실제 이번 분기 청구액은 <strong>주간단위</strong>와 <strong>차수별시수</strong>로 비례배분해서 계산돼요.<br><br>
                   <div class="p-2 bg-white border rounded mt-1">
                   <strong>예시</strong>: 월 강사료 <strong>35,000원</strong>, 주간단위 <strong>1</strong>,
                   차수별시수 <strong>4,4,4</strong> (3개 차수 × 4시간 = 총 12시간)라면<br>
                   → 기준시수 = 1 × 4 = <strong>4시간</strong> (월 기준)<br>
                   → 이번 분기 강사료 = 35,000 ÷ 4 × 12 = <strong>105,000원</strong>
                   </div><br>
                   즉 <strong>주간단위</strong>는 "이 강좌가 원래 1달에 몇 시간 진행되는 걸 기준으로 강사료가
                   책정됐는지"를 나타내고, <strong>차수별시수</strong>는 "이번 분기에 실제로 몇 시간 진행됐는지"를
                   나타내요. 실제 진행 시수가 기준보다 많으면 그만큼 더 청구되고, 적으면 덜 청구됩니다.`
        },
        {
            title: '🎯 1스텝 — 부서/강좌 세팅 ②: 강좌수(반수)의 의미',
            tab: '#step1', highlight: '#tbCourse',
            body: `"강좌수(반수)"를 2 이상으로 입력하면, 시스템이 <strong>"부서명(A)", "부서명(B)"</strong>처럼
                   반별로 이름이 붙은 <strong>개별 강좌를 자동으로 복제</strong>해서 강좌 요금표에 올려줘요.
                   즉 "부서"는 하나의 틀이고, 강좌수만큼 실제 청구 단위(반)가 만들어지는 구조예요.<br><br>
                   복제된 각 반은 이후 강좌 요금표에서 <strong>따로따로</strong> 단가를 수정할 수 있어요
                   (예: A반은 학생별로 수준별 교재를 사용하여 교재비를 각자 다르게 책정하는 경우).`
        },
        {
            title: '🎯 1스텝 — 부서/강좌 세팅 ③: 엑셀 업로드 시 주의할 점',
            tab: '#step1', highlight: '#fileCourse',
            body: `부서 정보를 <strong>엑셀로 일괄 업로드</strong>하면, 그 값이 <strong>1~4분기 전체에 동일하게
                   덮어써집니다.</strong> 만약 학기 중간(예: 2분기)부터 강사료가 바뀌는 강좌가 있다면,
                   업로드 후 반드시 <strong>해당 분기만 강좌 요금표에서 따로 다시 수정</strong>해줘야 해요.
                   그렇지 않으면 모든 분기가 같은 금액으로 청구됩니다.`
        },
        {
            title: '🎯 1스텝 — 부서/강좌 세팅 ④: 운영 체크란',
            tab: '#step1',
            body: `강좌 요금표의 <strong>"운영"</strong> 체크박스는 그 분기에 이 부서(또는 개별 강좌)를
                   <strong>폐강 처리</strong>하는 스위치예요. 체크를 끄면:<br>
                   1) 이미 등록된 수강생이 있으면 몇 명이 영향받는지 경고창이 뜨고<br>
                   2) 확인을 누르면 그 학생들은 전부 <strong>2스텝의 "미배정(누락)" 명단</strong>으로
                   자동 이동되어, 다른 강좌로 재배정해줘야 하는 상태가 됩니다.`
        },
        {
            title: '🎯 1스텝 — 부서/강좌 세팅 ⑤: 주간단위·차수는 환불 계산의 기초예요',
            tab: '#step1',
            body: `주간단위 · 차수별시수는 강사료 계산뿐 아니라, <strong>학생이 중도에 결석하거나 그만둘 때
                   환불액을 계산하는 기준</strong>으로도 그대로 쓰입니다.<br><br>
                   · <strong>결석(질병 등) 환불</strong>: 주간단위로 산출한 "시간당 단가"에 결석 시수를 곱해서 계산해요.
                   주간단위가 실제와 다르면 환불 단가도 틀어집니다.<br>
                   · <strong>포기(자퇴) 환불</strong>: 그만둔 시점이 속한 차수는 진행률에 따라 일부만,
                   아직 시작 안 한 남은 차수는 <strong>차수별시수 비율만큼 전액</strong> 환불돼요.<br><br>
                   그래서 1스텝의 주간단위·차수별시수를 정확히 입력해두는 게, 나중에 4스텝에서
                   환불을 처리할 때 금액이 맞게 나오는 전제조건이에요.`
        },
        {
            title: '🎯 2스텝 — 수강생 명단 관리',
            tab: '#step2', highlight: '[onclick="importFromPrevQuarter()"]',
            body: `학생을 강좌에 <strong>등록(수강 신청)</strong>하는 단계예요. 통합/강좌별 명단 엑셀 업로드,
                   또는 학년 · 반 · 번호 · 이름으로 개별 학생을 추가할 수 있어요. 1스텝에서 강좌를 폐강 처리하면
                   생기는 <strong>"미배정(누락)"</strong> 명단도 여기서 재배정합니다.<br><br>
                   <strong>이전분기 명단 가져오기</strong> 버튼을 쓰면, 직전 분기 수강생 명단을 이번 분기로
                   그대로 불러올 수 있어요. 이때 같은 강좌가 이번 분기에도 그대로 있으면 자동으로 배정되고,
                   강좌가 없어졌거나 이름이 바뀌었으면 <strong>"미배정(누락)"</strong>으로 떨어지니 별도로
                   재배정해줘야 해요.`
        },
        {
            title: '🎯 3스텝 — 자유수강권 관리',
            tab: '#step3', highlight: '[onclick="window.openTransferModal()"]',
            body: `이 스텝은 탭이 2개예요.<br>
                   🎟️ <strong>자유수강권 관리</strong>(편집 가능): 자유수강권 대상 학생을 엑셀 업로드나
                   개별 등록으로 지정합니다.<br>
                   🧒 <strong>초3 지원금 관리</strong>(조회 전용): 초3 대상 여부는 2스텝에서 등록한
                   <strong>학년(3학년)</strong>으로 자동 결정되기 때문에 여기서는 수정할 수 없고,
                   확인만 가능해요.<br><br>
                   두 탭 모두 <strong>"전입 조정된 학생만"</strong> 필터가 있어서, 학기 중 전입한 학생의
                   지원금 조정 내역만 따로 볼 수 있습니다.<br><br>
                   <strong>전입생 통합 콘솔</strong>: 전학 온 학생은 이전 학교에서 이미 지원금을 일부 썼을 수
                   있는데, 이 시스템은 그 기록을 모르니 기본 한도(자유수강권 기본액, 초3지원 연간 50만 원)를
                   그대로 적용해버려요. 이 콘솔에서 학생을 검색해 <strong>실제 남은 한도를 수동으로 입력</strong>하면,
                   그 값 기준으로 이후 정산이 이뤄집니다.`
        },
        {
            title: '🎯 4스텝 — 정산 마감 및 예외처리 ①: 3개 탭과 필터',
            tab: '#step4',
            body: `<strong>학생별 / 강좌별 / 분기별</strong> 3개 탭이 있고, 각 탭에서
                   <strong>전체 · 자유수강 · 초3지원</strong> 필터로 원하는 대상만 골라볼 수 있어요.`
        },
        {
            title: '🎯 4스텝 — 정산 마감 및 예외처리 ②: 학생 통합 콘솔 / 강좌 일괄 조정 콘솔',
            tab: '#step4',
            body: `<strong>학생 통합 콘솔</strong>: 학생별 탭에서 이름을 클릭하면 열려요 (이 두 콘솔은 4스텝뿐
                   아니라 <strong>1~4스텝 어디서든</strong> 학생 이름 · 강좌명이 클릭 가능하게(파란 글씨) 표시된
                   곳이면 똑같이 열립니다). 안에 3가지 기능이 있습니다.<br>
                   ✍️ <strong>실부담금 강제 조정</strong>: 사유를 적고 수강료 · 교재비 · 재료비를 원하는 만큼
                   증감시켜요 (예: 다자녀 할인).<br>
                   💸 <strong>환불 및 결석 처리</strong>: 개시전 · 결석 · 포기 사유별로 환불을 계산해요.
                   저장 전에 <strong>예상 환불액을 미리 보여주니</strong> — 실제 정산 엔진이 그대로 계산하는
                   값이라 믿고 확인할 수 있어요.<br>
                   🔵 <strong>개별공제 설정</strong>: 이 학생만 예외적으로 초3 · 자유수강권 공제 순서(수강료 ·
                   교재비 · 재료비 중 뭘 먼저 깎을지)를 환경설정의 전체 기본값과 다르게 지정할 수 있어요.
                   지정하면 화면에 "🔵 개별공제" 뱃지가 붙어서 예외 처리된 학생임을 한눈에 알 수 있습니다.<br><br>
                   <strong>강좌 일괄 조정 콘솔</strong>: 강좌명을 클릭하면 열려요. 그 강좌를 듣는 학생 전체
                   명단을 한 화면에서 보고, <strong>여러 학생에게 한꺼번에</strong> 또는 <strong>학생 한 명씩
                   개별로</strong> 수강료 · 교재비 · 재료비를 증감 조정할 수 있어요.`
        },
        {
            title: '🎯 4스텝 — 정산 마감 및 예외처리 ③: 시스템마감(차수 잠금)',
            tab: '#step4', highlight: '#closeSessChecks',
            body: `화면 상단의 <strong>🔒 시스템마감</strong> 체크박스로 차수(1차, 2차, 3차...)를 하나씩
                   마감할 수 있어요. 마감하면 그 시점의 데이터가 스냅샷으로 저장되고, <strong>더 이상
                   수정할 수 없게 잠깁니다.</strong><br><br>
                   <strong>마감은 반드시 순서대로</strong>: 1차 → 2차 → 3차 순으로만 마감할 수 있고,
                   해제할 때는 반대로 <strong>가장 최근 차수부터 역순으로만</strong> 풀 수 있어요.
                   중간 차수만 골라서 잠그거나 푸는 건 안 됩니다 — 회계 기록의 순서를 지키기 위한 규칙이에요.`
        },
        {
            title: '🎯 5스텝 — 서식 자동생성',
            tab: '#step5',
            body: `청구서, 명렬표, 환불이력서, 스마트출석부를 만드는 단계입니다. 각 서식이 어떤 용도인지는
                   5스텝 화면의 안내를 참고하세요.`
        }
    ],
    advanced: [
        {
            title: '🎯 폐강 누락자 재배정',
            tab: '#step1', highlight: '#tbMaster',
            body: `'가상마술'은 지금 1 · 2분기 모두 정상 운영 중이에요. <strong>2분기에 이 강좌가 갑자기
                   폐강됐다고 가정</strong>하고, 직접 폐강 처리부터 재배정까지 해보세요.<br><br>
                   1스텝에서 분기를 <strong>2분기</strong>로 바꾼 뒤, 부서 마스터 표에서 '가상마술'의
                   <strong>운영 체크박스를 꺼보세요.</strong> 이미 등록된 수강생이 있으면 경고창이 뜨고,
                   확인을 누르면 그 학생들이 전부 <strong>2스텝의 "미배정(누락)" 명단</strong>으로 자동
                   이동됩니다.`,
            checklist: [
                '1스텝에서 상단 분기를 2분기로 전환하기',
                "부서 마스터 표에서 '가상마술'의 운영 체크박스 끄기 → 경고창에서 확인",
                "2스텝 상단의 '누락명단 관리' 경고등 클릭",
                "명단 전체 선택 후 '선택 일괄 이동'으로 다른 강좌(예: 로봇과학)로 배정 완료"
            ]
        },
        {
            title: '🎯 초3 + 자유수강권 중복 대상자',
            tab: '#step4',
            body: `이 시스템의 핵심 규칙은 <strong>"초3지원금을 먼저 다 쓰고, 그 다음에 자유수강권을 쓴다"</strong>는
                   것이에요. 이 순서는 <strong>고정된 규칙</strong>이라 두 지원금을 동시에 받는 학생이라고
                   순서가 바뀌지 않습니다.<br><br>
                   환경설정의 <strong>"공제 우선순위"</strong>는 이것과는 다른 설정이에요 — 초3(또는 자유)
                   지원금 <strong>안에서</strong> 수강료 · 교재비 · 재료비 중 어떤 항목을 먼저 깎을지만
                   결정합니다. 4스텝에서 이 학생의 산출근거를 열어, 초3이 먼저 소진되고 남은 만큼만
                   자유수강권이 쓰였는지 확인해보세요.`
        },
        {
            title: '🎯 학생별로 다른 교재비 책정하기',
            tab: '#step1', highlight: '#tbCourse',
            body: `로봇과학(A)반은 수강생의 수준에 따라 교재비를 서로 다르게 책정해야 하는 상황이 생겼습니다.
                   1스텝의 부서 마스터에 입력한 "기초 교재비"는 그 강좌 전체에 적용되는 <strong>기본값</strong>일
                   뿐이고, 학생 개개인은 <strong>강좌 일괄 조정 콘솔</strong>에서 따로 조정할 수 있어요.<br><br>
                   참고로 <strong>학생 통합 콘솔 · 강좌 일괄 조정 콘솔은 특정 스텝 전용이 아니에요.</strong>
                   1~4스텝 어디서든 학생 이름이나 강좌명이 파란 글씨(클릭 가능)로 보이면, 그걸 눌러서
                   바로 열 수 있습니다.`,
            checklist: [
                '2스텝(수강생 명단 관리)에서 로봇과학(A)에 수강생 등록하기',
                '"로봇과학(A)" 강좌명을 아무 화면에서나 클릭 → 강좌 일괄 조정 콘솔 열기',
                '수강생 명단에서 학생별로 교재비(±) 칸에 각자 다른 금액 입력하기',
                '학생별 행에 있는 "저장" 버튼으로 한 명씩 개별 저장하기'
            ]
        },
        {
            title: '🎯 전입생의 지원금 한도 바로잡기',
            tab: '#step3', highlight: '[onclick="window.openTransferModal()"]',
            body: `이 시스템에는 사실 <strong>"전입생 처리 절차"라는 게 따로 있지 않아요.</strong> 모든 건
                   <strong>수강생 명단을 기준으로</strong> 판단합니다.<br><br>
                   수강생 중에 전입생이 있다는 걸 알게 됐고, 그 학생이 <strong>이전 학교에서 초3지원이나
                   자유수강권을 이미 일부 사용한 이력</strong>이 있다는 정보를 얻었다면 — 수강생 명단에서
                   그 학생을 <strong>전입생 통합 콘솔</strong>로 검색해서, "이전 학교에서 쓰고 남은 한도"로
                   직접 수정해주면 됩니다. 그게 이 기능의 전부예요.<br><br>
                   수정해주지 않으면 시스템은 이 학생을 "한도를 하나도 안 쓴 학생"으로 간주하고 기본 한도
                   (자유수강권 기본액, 초3지원 연 50만 원)를 그대로 적용해버리니, 전입 사실을 알게 된
                   시점에 바로 확인해주는 게 좋아요.`,
            checklist: [
                '2스텝에서 전입생이 수강생 명단에 등록되어 있는지 확인하기',
                '3스텝 → 전입생 통합 콘솔에서 그 학생 검색하기',
                '이전 학교에서 쓰고 남은 실제 한도를 입력하고 저장하기'
            ]
        },
        {
            title: '🎯 환불 / 부분환불 처리',
            tab: '#step4',
            body: `4스텝의 <strong>학생 통합 콘솔</strong>에서 환불을 처리할 때는 사유에 따라 계산 방식이 완전히
                   달라집니다.<br><br>
                   · <strong>개강 전 취소</strong>: 수강료 전액 환불<br>
                   · <strong>결석(질병 등)</strong>: 결석한 시수만큼 시간당 단가로 계산해 환불<br>
                   · <strong>포기(자퇴)</strong>: <strong>차수 단위 구간환불</strong>이 적용돼요. 그만둔
                   시점이 그 차수의 <strong>1/3 지점 이하</strong>라면 그 차수 수강료의 <strong>2/3을
                   환불</strong>, <strong>1/2 지점 이하</strong>라면 <strong>1/2을 환불</strong>, 그보다
                   더 진행됐다면 그 차수는 <strong>환불 없음(0원)</strong>이에요. 그리고 아직 시작하지
                   않은 남은 차수는 <strong>전액 환불</strong>됩니다.<br><br>
                   교재비 · 재료비는 별도로 <strong>전액 반환 / 직접 입력 / 반환 안 함</strong> 중 골라야 해요.
                   콘솔에 입력하면 저장 전에 <strong>예상 환불액을 미리 보여주니</strong>, 저장 전에 꼭 확인하세요.`,
            checklist: [
                "학생별 탭에서 환불할 학생 이름 클릭 (학생 통합 콘솔 열기)",
                "환불 사유(개강전/결석/포기)와 결석·진행 시수 입력",
                "교재비/재료비 반환 방식 선택 후 예상 환불액 확인",
                "저장하고 실제 정산액이 바뀌었는지 확인"
            ]
        },
        {
            title: '🎯 정원 초과 강좌의 스마트 출석부 생성',
            tab: '#step5', highlight: '[onclick="generateAllAttendanceBooks()"]',
            body: `5스텝의 스마트출석부 기본양식은 학생 명단이 <strong>40명 분</strong>으로 만들어져 있어요.
                   어떤 강좌의 수강생이 40명을 넘는다면, 그 강좌만 별도로 만들기보다 <strong>기본양식
                   엑셀 파일을 직접 열어서 명단 줄을 그 강좌의 실제 인원수만큼 늘린 뒤</strong> 그 늘린
                   양식을 업로드하면 돼요.<br><br>
                   반대로 명단 줄을 넉넉히 늘려서 업로드해도 걱정할 필요는 없어요 — 실제 수강 인원보다
                   빈 줄이 남으면 <strong>시스템이 자동으로 그 빈 줄을 정리</strong>해주기 때문에, 여러
                   강좌마다 인원수가 달라도 명단 줄이 가장 많이 필요한 강좌 기준으로 넉넉하게 양식을
                   만들어두면 한 번에 해결됩니다.`
        },
        {
            title: '🎯 마감 차수 잠금 해제 후 재정산',
            tab: '#step4', highlight: '#closeSessChecks',
            body: `이미 마감된 차수의 데이터를 수정해야 한다면, 잠금을 해제해야 해요. 이때 <strong>가장 최근
                   차수부터 역순으로만</strong> 해제할 수 있다는 규칙을 직접 확인해보세요.<br><br>
                   예를 들어 1 · 2 · 3차가 모두 마감된 상태라면, 1차를 풀기 전에 반드시 <strong>3차 → 2차
                   → 1차</strong> 순서로 풀어야 합니다. 중간 차수만 골라 푸는 건 막혀 있어요.`,
            checklist: [
                '4스텝 상단의 🔒 시스템마감에서 마감된 차수 확인하기',
                '가장 마지막 차수부터 체크 해제해보기',
                '중간 차수를 먼저 풀어보려고 시도해서 오류 메시지 확인하기'
            ]
        },
        {
            title: '🎯 학기 중간부터 시스템 도입하기 (교정본 / 강제 마감)',
            tab: '#step4', highlight: '[onclick="dlRoundtripExcel()"]',
            body: `이 기능은 <strong>이미 이전 분기를 우리 시스템 밖(로컬 규칙)으로 정산해버린 상태에서, 그
                   다음 분기부터 이 시스템을 새로 도입하는 경우</strong>를 위한 거예요. 이전 분기 기록이
                   이 시스템의 계산 로직과 딱 맞아떨어지지 않을 수 있으니, 그 기록을 <strong>강제로 그대로
                   반영</strong>해서 마감 처리하는 기능입니다.<br><br>
                   1) <strong>교정본 다운로드</strong>: 해당 분기의 원가 · 초3공제 · 자유공제 · 최종자부담
                   내역이 담긴 엑셀을 내려받습니다. 최종자부담 칸은 수식으로 돼 있어서, 원가나 공제액을
                   실제 로컬 기록에 맞게 고치면 자동으로 재계산돼요.<br>
                   2) 이 엑셀을 열어 <strong>실제로 이미 확정된 금액</strong>으로 수정합니다.<br>
                   3) <strong>강제 마감 업로드</strong>로 다시 올리면, 시스템이 그 값을 그대로 가져와
                   <strong>"강제 마감(🛠️)"</strong> 상태로 잠급니다. 이건 일반 마감(🔒)과 달리 엔진이
                   재계산하지 않고, 업로드한 숫자를 그대로 고정시켜요.`,
            checklist: [
                '4스텝에서 "교정본 다운로드" 버튼으로 해당 분기 엑셀 받기',
                '엑셀에서 실제 확정된 금액으로 수정하기',
                '"강제 마감 업로드"로 수정한 엑셀 올리기',
                '4스텝 체크박스에 🛠️(강제 마감) 아이콘이 뜨는지 확인하기'
            ]
        },
        {
            title: '🎯 회계연도 방식(통합 / 분리) 전환',
            action: 'openSettings', highlight: '[onclick="resetAllData()"]',
            body: `회계연도 방식은 환경설정이 아니라 <strong>시스템을 초기화해서 웰컴 화면으로 돌아가야만</strong>
                   바꿀 수 있어요. "재료비 분리(3D)"를 선택하면 모든 화면(요금표, 4스텝 3개 탭, 5스텝 서식)에
                   <strong>재료비 열이 추가</strong>되고, "통합"을 선택하면 재료비가 수강료에 합산되어
                   별도 열 없이 운영됩니다.<br><br>
                   왜 환경설정처럼 즉시 바꾸게 안 해놨을까요? 재료비라는 항목 자체가 데이터 구조에 있고
                   없고를 결정하는 값이라, 이미 쌓인 회계 기록을 안전하게 바꿀 방법이 없기 때문이에요.
                   그래서 데이터가 하나도 없는 시점(도입 초기)에 한 번 정하고 가는 게 원칙입니다. 초기화를
                   한 번 직접 해보면서, 웰컴 화면에서 이 선택지가 어떻게 나오는지 확인해보세요.`
        }
    ]
};

// 💡 튜토리얼 진행 상태 — 트랙(기본/심화)별로 스텝 위치를 각각 기억
window.tutorialState = {
    track: 'basic',
    stepIndex: { basic: 0, advanced: 0 }
};

// 💡 탭(기본과정/심화과정) 전환 — 전환해도 그 탭에서 마지막에 보던 스텝을 그대로 이어서 보여줌
window.switchTutorialTrack = function(track) {
    if (!window.TUTORIAL_CONTENT[track]) return;
    window.tutorialState.track = track;
    window.renderTutorialStep();
};

// 💡 현재 탭 안에서 스텝 이동
window.changeTutorialStep = function(direction) {
    const track = window.tutorialState.track;
    const list = window.TUTORIAL_CONTENT[track];
    let idx = window.tutorialState.stepIndex[track] + direction;
    if (idx < 0) idx = 0;
    if (idx > list.length - 1) idx = list.length - 1;
    window.tutorialState.stepIndex[track] = idx;
    window.renderTutorialStep();
};

// 💡 현재 탭/스텝 내용을 위젯 화면에 그려준다
window.renderTutorialStep = function() {
    const track = window.tutorialState.track;
    const list = window.TUTORIAL_CONTENT[track];
    const idx = window.tutorialState.stepIndex[track];
    const step = list[idx];
    if (!step) return;

    // 탭 버튼 활성 표시
    const btnBasic = window.$('tutorialTabBasic');
    const btnAdvanced = window.$('tutorialTabAdvanced');
    if (btnBasic) btnBasic.classList.toggle('active', track === 'basic');
    if (btnAdvanced) btnAdvanced.classList.toggle('active', track === 'advanced');

    // 본문 렌더링 (체크리스트가 있으면 함께 표시)
    let checklistHtml = '';
    if (Array.isArray(step.checklist) && step.checklist.length > 0) {
        const items = step.checklist.map(c => `<li>⬜ ${c}</li>`).join('');
        checklistHtml = `
            <div class="mb-1">
                <span class="badge bg-danger mb-1">🔹 실행 체크리스트</span>
                <ul class="list-unstyled small mb-0 mt-1" style="line-height: 1.6;">${items}</ul>
            </div>`;
    }

    const content = window.$('tutorialStepContent');
    if (content) {
        content.innerHTML = `
            <div class="mb-3">
                <div class="fw-bold text-dark border-start border-primary border-4 ps-2 mb-2" style="font-size:0.95rem; line-height:1.4;">${step.title}</div>
                <div class="mt-2 mb-2 p-2 bg-light rounded border small">
                    <span class="text-muted">${step.body}</span>
                </div>
            </div>
            ${checklistHtml}`;
    }

    // 인디케이터 및 이전/다음 버튼 상태 갱신
    const indicator = window.$('tutorialStepIndicator');
    if (indicator) indicator.innerText = `${idx + 1} / ${list.length}`;

    const btnPrev = window.$('btnTutorialPrev');
    const btnNext = window.$('btnTutorialNext');
    if (btnPrev) btnPrev.disabled = (idx === 0);
    if (btnNext) btnNext.disabled = (idx === list.length - 1);

    // 💡 "화면에서 보기" 버튼: 이 스텝에 연결된 화면/요소가 있을 때만 노출
    const btnGoTo = window.$('btnTutorialGoTo');
    if (btnGoTo) btnGoTo.style.display = (step.tab || step.highlight || step.action) ? 'inline-block' : 'none';
};

// 💡 현재 스텝에 연결된 화면으로 이동하고, 관련 요소를 강조 표시한다.
window.goToTutorialTarget = function() {
    const track = window.tutorialState.track;
    const list = window.TUTORIAL_CONTENT[track];
    const idx = window.tutorialState.stepIndex[track];
    const step = list[idx];
    if (!step) return;

    const doHighlight = () => { if (step.highlight) window.spotlightElement(step.highlight); };

    const doTabAndHighlight = () => {
        if (step.tab) {
            const tabBtn = document.querySelector(`[data-bs-target="${step.tab}"]`);
            if (tabBtn && typeof bootstrap !== 'undefined' && bootstrap.Tab) {
                bootstrap.Tab.getOrCreateInstance(tabBtn).show();
                setTimeout(doHighlight, 350); // 탭 전환(페이드) 애니메이션이 끝난 뒤 강조
            } else {
                doHighlight();
            }
        } else {
            doHighlight();
        }
    };

    // 💡 탭 전환에 앞서 필요한 사전 동작(예: 환경설정 모달 열기)이 있으면 먼저 실행
    if (step.action && typeof window[step.action] === 'function') {
        window[step.action]();
        setTimeout(doTabAndHighlight, 350); // 모달 오픈 애니메이션이 끝난 뒤 진행
    } else {
        doTabAndHighlight();
    }
};

// 💡 화면 요소를 스크롤로 짚어주고 잠시 강조 표시하는 유틸
// selector로 지정한 요소로 스크롤 이동 후, 파란 테두리로 잠깐 강조한다.
window.spotlightElement = function(selector) {
    const target = document.querySelector(selector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.style.transition = 'outline-color 0.3s ease, box-shadow 0.3s ease';
    target.style.outline = '3px solid #0d6efd';
    target.style.outlineOffset = '2px';
    target.style.boxShadow = '0 0 0 6px rgba(13,110,253,0.25)';
    setTimeout(() => {
        target.style.outline = '';
        target.style.outlineOffset = '';
        target.style.boxShadow = '';
    }, 2500);
};

// 💡 튜토리얼 위젯 최초 진입 시 호출 (샌드박스 시작 시 app-core.js의 startGateway에서 호출됨)
// 항상 기본과정 1번 스텝부터 시작하도록 초기화
window.initTutorialWidget = function() {
    window.tutorialState = { track: 'basic', stepIndex: { basic: 0, advanced: 0 } };
    window.renderTutorialStep();
};