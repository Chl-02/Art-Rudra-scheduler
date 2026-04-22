# ⚔️ 아티 성역 스케줄러 — 아이온2 팀 스케줄 조율 도구

아이온2 게임 테마의 팀 스케줄링 웹사이트입니다.
Firebase Firestore를 백엔드로 사용하며, GitHub Pages로 무료 운영 가능합니다.

🔗 **라이브 URL**: https://Chl-02.github.io/Art-Rudra-scheduler

---

## 사용법

### 1. 시간 등록하기
1. 메인 화면에서 **자기 닉네임 카드**를 클릭합니다.
2. 시간 입력 화면에서 **가능한 시간**을 선택합니다.
   - **드래그**로 여러 칸을 한번에 선택할 수 있습니다 (PC).
   - **모드 전환**: "불가능한 시간 선택" 모드로 바꾸면, 안 되는 시간만 선택하면 됩니다.
   - **요일 헤더 클릭**: 해당 요일 전체를 선택/해제합니다.
3. **"시간 각인하기"** 버튼을 눌러 저장합니다.

### 2. 결과 확인하기
- 메인 화면에서 **"운명의 시간 확인하기"** 버튼을 클릭합니다.
- **스마트 추천** 탭: 전원 가능 시간, 1명 조율 필요 시간, 조율 제안을 확인합니다.
- **히트맵** 탭: 요일×시간 격자에서 가능 인원수를 시각적으로 확인합니다.
- **"결과 복사하기"** 버튼으로 결과를 클립보드에 복사할 수 있습니다.

### 3. 설정 (관리자)
- 우측 상단 **⚙️ 아이콘**을 클릭합니다.
- 팀 멤버 닉네임/직업 수정, 시간 범위 변경이 가능합니다.
- **"전체 초기화"**: 새 주차를 시작할 때 모든 스케줄 데이터를 초기화합니다 (기존 데이터는 히스토리에 보관).

---

## 설치 및 배포

### Firebase 설정
1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 생성합니다.
2. Firestore Database를 활성화합니다.
3. Firestore 보안 규칙을 설정합니다:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
4. 웹 앱을 등록하고 설정값을 복사합니다.
5. `src/firebase.js` 파일에서 설정값을 교체합니다.

### 로컬 개발
```bash
npm install
npm run dev
```

### 배포
main 브랜치에 push하면 GitHub Actions가 자동으로 빌드+배포합니다.

```bash
git add .
git commit -m "배포"
git push origin main
```

GitHub 레포 Settings → Pages → Source를 **GitHub Actions**로 설정해야 합니다.

---

## 기술 스택
- **프론트엔드**: React 18 + Vite
- **백엔드**: Firebase Firestore (무료 티어)
- **자연어 파서(선택)**: Firebase Cloud Functions v2 (asia-northeast3) + Google Gemini 2.5 Flash (무료 티어)
- **호스팅**: GitHub Pages (무료)
- **폰트**: Cinzel (영문), Noto Sans KR (한글)

---

## ✨ 자연어 시간 입력 (선택 기능)

`"목금 6시~10시 빼고 다 가능"`, `"주말은 저녁 8시 이후 가능"` 같은 문장을 Gemini가 파싱해 슬롯에 자동 적용합니다.

### 동작 구조
```
브라우저 → Firebase httpsCallable('parseSchedule') → Gemini API (generativelanguage.googleapis.com) → JSON(slots[]) → 화면 반영
```
- Gemini API 키는 Google Secret Manager에만 저장 (Cloud Function 시크릿). 프론트에는 노출되지 않습니다.
- Firebase SDK가 함수 URL·CORS를 자동 처리하므로 별도 설정 없음.
- Firebase 미설정 시 버튼이 자동으로 숨겨집니다.

### 설정 절차 (최초 1회)

1. **Firebase Blaze 플랜 업그레이드** — Functions 사용 필수 (무료 한도 내 $0).
2. **Gemini API 키 발급** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key** → Firebase 프로젝트(`art-rudra-scheduler`)에 바인딩 → 키 복사. **결제 정보 등록 불필요, 완전 무료**.
3. **Firebase CLI 준비**:
   ```bash
   npm install -g firebase-tools
   firebase login
   cd functions && npm install && cd ..
   ```
4. **시크릿 등록**:
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   # → 위에서 복사한 키 붙여넣기
   ```
5. **함수 배포**:
   ```bash
   firebase deploy --only functions
   ```
   - 처음이면 Cloud Build / Artifact Registry / Secret Manager API 활성화 링크가 뜸 → 열어서 Enable.
6. **Cloud Run 인증 해제** (1회만): 콘솔 [Cloud Run → parseschedule → 보안 → 인증되지 않은 호출 허용](https://console.cloud.google.com/run?project=art-rudra-scheduler) 또는 `gcloud run services add-iam-policy-binding parseschedule --region=asia-northeast3 --member=allUsers --role=roles/run.invoker --project=art-rudra-scheduler`.

### 운영
- 프론트는 자동으로 `parseSchedule`(asia-northeast3) 함수를 호출.
- 키 갱신 시: `firebase functions:secrets:set GEMINI_API_KEY` → `firebase deploy --only functions`.
- 로그: `firebase functions:log --only parseSchedule`.

### 비용
- **Gemini 2.5 Flash 무료 티어**: 분당 10회, 일 1,500회, 분당 100만 토큰. 팀 스케줄링 용도로 초과 불가능한 수준.
- Cloud Functions 무료 한도(월 200만 호출) 내 $0.
- **완전 무료로 운영** (Blaze 업그레이드는 카드 등록만 필요, 실제 과금 없음).
