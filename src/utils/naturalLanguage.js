// 자연어 일정 입력 → 슬롯 변환 클라이언트
// Firebase Cloud Function `parseSchedule`(asia-northeast3)을 httpsCallable로 호출.
// 네트워크 URL/CORS는 Firebase SDK가 자동 처리하고, Anthropic 키는 함수 시크릿에만 존재.

import { httpsCallable } from 'firebase/functions'
import { functions, isFirebaseConfigured } from '../firebase'

// 기능 노출 여부: Firebase가 설정돼 있으면 true.
// (함수가 아직 배포 안 돼 있어도 UI는 뜨고, 호출 시점에 에러 메시지로 안내됨)
export function isNlpConfigured() {
  return isFirebaseConfigured()
}

/**
 * 자연어 문장을 슬롯 배열로 파싱
 * @param {string} text - "목금 6~10시 빼고 다 가능"
 * @param {{timeRange:{start:number,end:number}, timeUnit:number}} config
 * @returns {Promise<{mode:'available'|'unavailable', slots:string[], notes:string, count:number}>}
 */
export async function parseNaturalLanguage(text, config) {
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('입력 문장이 비어있습니다.')
  if (trimmed.length > 500) throw new Error('문장이 너무 깁니다 (500자 이하).')

  const callable = httpsCallable(functions, 'parseSchedule')
  try {
    const { data } = await callable({ text: trimmed, config })
    if (!Array.isArray(data?.slots)) {
      throw new Error('잘못된 응답 포맷')
    }
    return {
      mode: data.mode === 'unavailable' ? 'unavailable' : 'available',
      slots: data.slots,
      notes: data.notes || '',
      count: data.count ?? data.slots.length
    }
  } catch (e) {
    // Firebase callable 에러는 e.message에 사용자 메시지가 들어있음
    throw new Error(e?.message || '파싱 실패')
  }
}
