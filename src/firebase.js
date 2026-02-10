// Firebase 설정 및 초기화
// ⚠️ 아래 설정값을 Firebase 콘솔에서 복사한 실제 값으로 교체하세요
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
}

// Firebase 초기화
const app = initializeApp(firebaseConfig)

// Firestore 데이터베이스 인스턴스
export const db = getFirestore(app)

// Firebase 설정이 완료되었는지 확인하는 헬퍼
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY"
}
