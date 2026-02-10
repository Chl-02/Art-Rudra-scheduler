// Firebase 설정 및 초기화
// ⚠️ 아래 설정값을 Firebase 콘솔에서 복사한 실제 값으로 교체하세요
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCvPjw_AI_zzHb5QEnRQKlwbrOgupQiyKo",
  authDomain: "art-rudra-scheduler.firebaseapp.com",
  projectId: "art-rudra-scheduler",
  storageBucket: "art-rudra-scheduler.firebasestorage.app",
  messagingSenderId: "596907565032",
  appId: "1:596907565032:web:7360b0b00d1858e5d68e5d",
  measurementId: "G-11MPG3PLK7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Firestore 데이터베이스 인스턴스
export const db = getFirestore(app)

// Firebase 설정이 완료되었는지 확인하는 헬퍼
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY"
}
