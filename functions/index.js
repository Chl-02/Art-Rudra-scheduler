// Cloud Function v2 — 자연어 일정을 Google Gemini가 파싱해서 슬롯 배열로 변환
// 프론트는 httpsCallable('parseSchedule')로 호출.
// Gemini 키는 firebase functions:secrets:set GEMINI_API_KEY 로 주입.
// Google AI Studio 무료 티어(gemini-2.5-flash: 1500 req/일, 10 req/분) 사용.
// v1.1 — PM 기본 해석 + 범위 표현 전처리 + few-shot 프롬프트

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'

const GEMINI_KEY = defineSecret('GEMINI_API_KEY')

setGlobalOptions({ region: 'asia-northeast3' })

const MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const MAX_INPUT_LEN = 500
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const parseSchedule = onCall(
  {
    secrets: [GEMINI_KEY],
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  async (request) => {
    const data = request.data || {}
    const text = typeof data.text === 'string' ? data.text.trim() : ''
    const config = data.config || {}

    if (!text) throw new HttpsError('invalid-argument', 'text is required')
    if (text.length > MAX_INPUT_LEN) {
      throw new HttpsError('invalid-argument', `text too long (max ${MAX_INPUT_LEN})`)
    }

    const range = normalizeRange(config.timeRange)
    const unit = normalizeUnit(config.timeUnit)

    const apiKey = GEMINI_KEY.value()
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEY not configured')
    }

    try {
      return await callGemini(apiKey, text, { range, unit })
    } catch (e) {
      console.error('gemini call failed', e)
      throw new HttpsError('internal', e?.message || 'upstream error')
    }
  }
)

function normalizeRange(r) {
  const start = Number.isInteger(r?.start) ? r.start : 20
  const end = Number.isInteger(r?.end) ? r.end : 25
  if (end < start) return { start, end: start }
  return { start, end }
}
function normalizeUnit(u) {
  return [10, 30, 60].includes(u) ? u : 60
}

function buildSystemPrompt({ range, unit }) {
  return [
    '당신은 한국어 사용자의 일정 설명을 아이온2 팀 스케줄러 슬롯 형식으로 변환하는 파서입니다.',
    '',
    '## 🕐 가장 중요한 규칙 — 시간 해석 (반드시 준수)',
    '사용자가 말하는 시간은 **게임 팀 모임 시간**이므로 기본적으로 **저녁/밤(오후)**을 의미한다.',
    '',
    '다음 규칙을 엄격히 적용하라:',
    '1. **1~12 범위의 숫자는 반드시 +12를 더해 오후(13~24시)로 해석한다.** 이게 최우선 기본 동작이다.',
    '   - "1시" → 13시',
    '   - "2시" → 14시',
    '   - "3시" → 15시',
    '   - "6시" → 18시',
    '   - "10시" → 22시',
    '   - "12시" → 12시 (정오) 또는 24시 (자정). 문맥에 따라 선택.',
    '2. **예외 — 다음 키워드가 숫자 앞에 붙으면 오전(AM)으로 해석:**',
    '   - "오전", "아침", "새벽", "AM", "am"',
    '   - 예: "아침 6시" → 6시, "새벽 2시" → 2시 (또는 26시 = 다음날 새벽 2시)',
    '3. **예외 — 13 이상 숫자는 그대로 24시간제.**',
    '   - "14시" → 14, "22시" → 22, "25시" → 25 (다음날 새벽 1시)',
    '4. **범위 표현도 동일 규칙.**',
    '   - "1시~3시" → 13~15시 (결코 1~3시가 아님)',
    '   - "6~10시" → 18~22시',
    '   - "오전 6시~10시" → 6~10시',
    '',
    '## 슬롯 포맷',
    '- 슬롯 키는 `day-HH:MM` 형식 (예: `mon-20:00`, `fri-22:30`).',
    `- 요일 키: ${DAY_KEYS.join(', ')} (월=mon, 화=tue, 수=wed, 목=thu, 금=fri, 토=sat, 일=sun).`,
    '- 시는 24시간제. 자정 이후(다음날 새벽)는 24~30 범위 사용.',
    '',
    '## 입력 컨텍스트',
    `- 현재 표시 시간 범위: ${range.start}시 ~ ${range.end}시.`,
    `- 시간 단위: ${unit}분.`,
    '',
    '## 기타 규칙',
    '1. mode는 "가능"/"됨" 중심이면 "available", "빼고"/"불가"/"안됨" 중심이면 "unavailable".',
    `2. 현재 범위(${range.start}~${range.end}시) 안의 슬롯만 생성, ${unit}분 단위로.`,
    '3. 종료 시간이 "~10시"처럼 표현되면 해당 시각 직전까지(그 시각 슬롯 제외).',
    '4. "주말"=토·일, "평일"=월~금, "매일"=월~일.',
    '5. 해석이 모호하면 `notes`에 한 줄로 해설.',
    '',
    '## 몇 가지 예시 (참고용)',
    '',
    '입력: "월수금 1시~3시 가능"',
    `→ mode: "available", slots: 월·수·금 × 13시·14시 (15시 미포함, 종료 직전까지). 범위 안인 것만.`,
    `   notes: "1~3시를 오후 13~15시로 해석 (오전이면 '아침' 붙여주세요)."`,
    '',
    '입력: "주말 8시 이후 가능"',
    '→ mode: "available", slots: 토·일 × 20시부터 범위 끝까지. notes: "8시 = 오후 8시(20시)".',
    '',
    '입력: "아침 6시~10시 가능"',
    '→ mode: "available", slots: 월~일 × 6·7·8·9시 (10시 미포함). notes: "".',
    '',
    '## 출력',
    '반드시 다음 JSON 스키마에 맞춰 단일 JSON 객체만 출력:',
    '{ "mode": "available" | "unavailable", "slots": string[], "notes": string }'
  ].join('\n')
}

// 오전 키워드가 없는 1~11시 숫자를 오후(+12)로 미리 치환.
// LLM에 보내기 전에 확정적으로 의미를 못박음.
function normalizeToPMDefault(text) {
  const shift = (n) => (n >= 1 && n <= 11 ? n + 12 : n)
  // 오전 키워드 보호 마커 (LLM 전달 전 제거)
  const LOCK = '⁣' // invisible separator
  const lockNum = (s) => s.replace(/(\d+)/g, `${LOCK}$1${LOCK}`)
  const unlock = (s) => s.replace(new RegExp(LOCK, 'g'), '')

  // Step 1: 범위 표현 처리. AM 키워드 있으면 숫자를 잠그고, 없으면 양쪽 다 시프트.
  let out = text.replace(
    /(오전|아침|새벽|정오|낮|AM|am)?\s*(\d{1,2})\s*시?\s*[~\-]\s*(\d{1,2})\s*시/g,
    (match, kw, aStr, bStr) => {
      if (kw) return lockNum(match) // AM 키워드 → 숫자 잠그고 그대로
      return `${shift(parseInt(aStr, 10))}~${shift(parseInt(bStr, 10))}시`
    }
  )

  // Step 2: 단일 "N시" (AM 키워드 명시 또는 잠긴 숫자는 건너뜀)
  out = out.replace(
    /(오전|아침|새벽|정오|낮|AM|am)?\s*(\d{1,2})\s*시/g,
    (match, kw, numStr) => {
      if (kw) return match
      if (match.includes(LOCK)) return match // 이미 보호됨
      return `${shift(parseInt(numStr, 10))}시`
    }
  )

  return unlock(out)
}

async function callGemini(apiKey, userText, ctx) {
  const normalized = normalizeToPMDefault(userText)
  const userMessage = normalized === userText
    ? userText
    : `${userText}\n\n(시스템 주석: 기본 오후 해석으로 "${normalized}"으로 이해함.)`

  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(ctx) }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['available', 'unavailable'] },
          slots: {
            type: 'array',
            items: { type: 'string' }
          },
          notes: { type: 'string' }
        },
        required: ['mode', 'slots']
      }
    }
  }

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]
  const textOut = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('')
  if (!textOut) {
    const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || 'empty'
    throw new Error(`Gemini returned no content (${reason})`)
  }

  let parsed
  try {
    parsed = JSON.parse(textOut)
  } catch {
    throw new Error(`Gemini JSON parse failed: ${textOut.slice(0, 200)}`)
  }

  const mode = parsed.mode === 'unavailable' ? 'unavailable' : 'available'
  const rawSlots = Array.isArray(parsed.slots) ? parsed.slots : []
  const notes = typeof parsed.notes === 'string' ? parsed.notes : ''

  const slots = sanitizeSlots(rawSlots, ctx)

  return {
    mode,
    slots,
    notes,
    count: slots.length,
    model: MODEL
  }
}

function sanitizeSlots(slots, { range, unit }) {
  const seen = new Set()
  const valid = []
  const slotRe = /^(mon|tue|wed|thu|fri|sat|sun)-(\d{1,2}):(\d{2})$/
  for (const raw of slots) {
    if (typeof raw !== 'string') continue
    const m = raw.match(slotRe)
    if (!m) continue
    const [, day, hStr, mStr] = m
    const hour = Number(hStr)
    const minute = Number(mStr)
    if (hour < range.start || hour > range.end) continue
    if (minute % unit !== 0) continue
    if (minute >= 60) continue
    const key = `${day}-${hour}:${String(minute).padStart(2, '0')}`
    if (seen.has(key)) continue
    seen.add(key)
    valid.push(key)
  }
  return valid
}
