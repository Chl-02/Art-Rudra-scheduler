// 스마트 스케줄 분석 유틸리티
// 겹치는 시간을 분석하고 지능형 추천을 생성

// 요일 목록 (키 → 한글 표시)
export const DAYS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' }
]

// 시간 표시 포맷 (24시간제 → 읽기 쉬운 한글 표기)
export function formatHour(hour) {
  const h = hour >= 24 ? hour - 24 : hour
  if (h === 0) return '자정(0시)'
  if (h < 12) return `오전 ${h}시`
  if (h === 12) return '오후 12시'
  return `오후 ${h - 12}시`
}

// 간략한 시간 표시 (격자 헤더용)
export function formatHourShort(hour) {
  const h = hour >= 24 ? hour - 24 : hour
  return `${h}시`
}

// 슬롯 키에서 요일/시간 파싱
export function parseSlot(slot) {
  const [day, hourStr] = slot.split('-')
  return { day, hour: parseInt(hourStr) }
}

// 슬롯 키 생성
export function makeSlot(day, hour) {
  return `${day}-${hour}`
}

// 설정된 시간 범위의 모든 슬롯 목록 생성
export function generateAllSlots(timeRange) {
  const slots = []
  for (const { key } of DAYS) {
    for (let h = timeRange.start; h <= timeRange.end; h++) {
      slots.push(makeSlot(key, h))
    }
  }
  return slots
}

// 멤버의 가능한 슬롯 목록 계산 (모드에 따라 변환)
export function getAvailableSlots(memberData, allSlots) {
  if (!memberData || !memberData.slots) return []
  // mode가 'unavailable'이면 선택된 슬롯을 제외한 나머지가 가능 시간
  if (memberData.mode === 'unavailable') {
    return allSlots.filter(s => !memberData.slots.includes(s))
  }
  // 기본(available): 선택된 슬롯이 곧 가능 시간
  return memberData.slots
}

// 슬롯을 요일별로 그룹화하여 연속 시간대로 합치기
function groupConsecutiveSlots(slots) {
  const byDay = {}
  slots.forEach(slot => {
    const { day, hour } = parseSlot(slot)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(hour)
  })

  const groups = []
  for (const [day, hours] of Object.entries(byDay)) {
    hours.sort((a, b) => a - b)
    let start = hours[0]
    let end = hours[0]
    for (let i = 1; i < hours.length; i++) {
      if (hours[i] === end + 1) {
        end = hours[i]
      } else {
        groups.push({ day, start, end: end + 1 })
        start = hours[i]
        end = hours[i]
      }
    }
    groups.push({ day, start, end: end + 1 })
  }
  return groups
}

// 연속 시간대를 읽기 쉬운 텍스트로 변환
export function formatTimeRange(day, start, end) {
  const dayLabel = DAYS.find(d => d.key === day)?.label || day
  return `${dayLabel}요일 ${formatHour(start)}~${formatHour(end)}`
}

/**
 * 메인 분석 함수 — 모든 멤버의 스케줄을 분석하여 추천 결과 생성
 * @param {Object} schedules - Firestore에서 가져온 스케줄 데이터
 * @param {Array} members - 멤버 목록 [{name, class, icon}, ...]
 * @param {Object} timeRange - {start, end} 시간 범위
 * @returns {Object} 분석 결과
 */
export function analyzeSchedules(schedules, members, timeRange) {
  const allSlots = generateAllSlots(timeRange)
  const submittedMembers = members.filter(m => schedules[m.name])

  // 각 슬롯별 가능/불가능 멤버 집계
  const slotAvailability = {}
  for (const slot of allSlots) {
    slotAvailability[slot] = {
      available: [],
      unavailable: []
    }
    for (const member of submittedMembers) {
      const memberSlots = getAvailableSlots(schedules[member.name], allSlots)
      if (memberSlots.includes(slot)) {
        slotAvailability[slot].available.push(member.name)
      } else {
        slotAvailability[slot].unavailable.push(member.name)
      }
    }
  }

  const totalMembers = submittedMembers.length

  // ✅ 전원 가능 시간
  const allAvailable = allSlots.filter(
    s => slotAvailability[s].available.length === totalMembers && totalMembers > 0
  )
  const allAvailableGroups = groupConsecutiveSlots(allAvailable)

  // ⚠️ 1명만 빠지는 시간
  const oneMissing = allSlots
    .filter(s => slotAvailability[s].available.length === totalMembers - 1 && totalMembers > 1)
    .map(s => ({
      slot: s,
      missing: slotAvailability[s].unavailable,
      count: slotAvailability[s].available.length,
      total: totalMembers
    }))

  // 🔄 인접 시간 조율 제안 생성
  // 1명만 빠지는 각 시간대에 대해, 빠진 사람이 ±1~2시간 이내에 가능한 모든 경우를 제안
  // 예: 10시에 C 불가, C가 9시·11시 둘 다 가능 → 2가지 조율 제안 모두 표시
  const rawAdjustments = []
  const seenKeys = new Set()
  for (const item of oneMissing) {
    const { day, hour } = parseSlot(item.slot)
    const missingName = item.missing[0]
    const memberAvailable = getAvailableSlots(schedules[missingName], allSlots)
    const dayLabel = DAYS.find(d => d.key === day)?.label || day

    for (const offset of [-1, 1, -2, 2]) {
      const nearbyHour = hour + offset
      const nearbySlot = makeSlot(day, nearbyHour)
      if (!memberAvailable.includes(nearbySlot)) continue

      // 중복 제거 (같은 슬롯·같은 사람·같은 근처시간)
      const key = `${item.slot}|${missingName}|${nearbySlot}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      // 빠진 사람 관점: 11시에 가능한데 10시 모임 → "앞당기면"
      //                 9시에 가능한데 10시 모임 → "늦추면"
      const direction = offset > 0 ? '앞당기면' : '늦추면'
      rawAdjustments.push({
        targetSlot: item.slot,
        missingMember: missingName,
        nearbySlot,
        offset: Math.abs(offset),
        direction,
        description: `${dayLabel}요일 ${formatHour(hour)}에 ${missingName}님 불가 → ${formatHour(nearbyHour)}에서 ${Math.abs(offset)}시간 ${direction} 전원 가능`
      })
    }
  }

  // 정렬: ±1시간 제안 우선, 같은 offset이면 요일·시간 순
  const adjustments = rawAdjustments.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset
    return allSlots.indexOf(a.targetSlot) - allSlots.indexOf(b.targetSlot)
  })

  // 📊 2명 빠지는 시간
  const twoMissing = allSlots
    .filter(s => slotAvailability[s].available.length === totalMembers - 2 && totalMembers > 2)
    .map(s => ({
      slot: s,
      missing: slotAvailability[s].unavailable,
      count: slotAvailability[s].available.length,
      total: totalMembers
    }))

  return {
    allAvailable,
    allAvailableGroups,
    oneMissing,
    adjustments,
    twoMissing,
    slotAvailability,
    totalMembers,
    submittedCount: submittedMembers.length
  }
}

/**
 * 결과를 클립보드용 텍스트로 변환
 */
export function formatResultText(result, members) {
  let text = `📅 이번주 아티 성역 스케줄 결과\n\n`

  // 전원 가능
  if (result.allAvailableGroups.length > 0) {
    text += `✅ 전원 가능:\n`
    result.allAvailableGroups.forEach(g => {
      text += `- ${formatTimeRange(g.day, g.start, g.end)}\n`
    })
    text += '\n'
  } else {
    text += `❌ 전원 가능한 시간이 없습니다.\n\n`
  }

  // 1명 조율 필요
  if (result.oneMissing.length > 0) {
    text += `⚠️ 거의 가능 (1명 조율 필요):\n`
    // 중복 제거를 위해 슬롯별로 그룹화
    const seen = new Set()
    result.oneMissing.forEach(item => {
      const { day, hour } = parseSlot(item.slot)
      const dayLabel = DAYS.find(d => d.key === day)?.label
      const key = `${dayLabel}요일 ${formatHour(hour)}`
      if (!seen.has(key)) {
        seen.add(key)
        text += `- ${key} (${item.count}/${item.total}명, ${item.missing.join(', ')}님 불가)\n`
      }
    })
    text += '\n'
  }

  // 조율 제안
  if (result.adjustments.length > 0) {
    text += `🔄 조율 제안:\n`
    result.adjustments.forEach(adj => {
      text += `- ${adj.description}\n`
    })
    text += '\n'
  }

  // 참여 현황
  text += `📊 참여: ${result.submittedCount}/${members.length}명 등록 완료\n`

  return text
}
