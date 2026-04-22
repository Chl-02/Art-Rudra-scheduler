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
export function formatHour(hour, minute = 0) {
  const h = hour >= 24 ? hour - 24 : hour
  let base
  if (h === 0) base = '자정(0시)'
  else if (h < 12) base = `오전 ${h}시`
  else if (h === 12) base = '오후 12시'
  else base = `오후 ${h - 12}시`
  if (minute > 0) base += ` ${minute}분`
  return base
}

// 간략한 시간 표시 (격자 헤더용)
export function formatHourShort(hour, minute = 0) {
  const h = hour >= 24 ? hour - 24 : hour
  if (minute > 0) return `${h}:${String(minute).padStart(2, '0')}`
  return `${h}시`
}

// 슬롯 키 생성: day-hour:minute
export function makeSlot(day, hour, minute = 0) {
  return `${day}-${hour}:${String(minute).padStart(2, '0')}`
}

// 슬롯 키에서 요일/시간/분 파싱
export function parseSlot(slot) {
  const [day, timeStr] = slot.split('-')
  const [hourStr, minuteStr] = timeStr.split(':')
  return { day, hour: parseInt(hourStr), minute: parseInt(minuteStr || '0') }
}

// 설정된 시간 범위의 모든 슬롯 목록 생성
export function generateAllSlots(timeRange, timeUnit = 60) {
  const slots = []
  const stepsPerHour = 60 / timeUnit
  for (const { key } of DAYS) {
    for (let h = timeRange.start; h <= timeRange.end; h++) {
      for (let s = 0; s < stepsPerHour; s++) {
        const minute = s * timeUnit
        slots.push(makeSlot(key, h, minute))
      }
    }
  }
  return slots
}

// 큰 단위 슬롯을 작은 단위로 확장
// 예: fromUnit=60, toUnit=30 → "mon-20:00" → ["mon-20:00", "mon-20:30"]
export function expandSlots(slots, fromUnit, toUnit) {
  if (fromUnit <= toUnit) return slots
  const expanded = []
  const ratio = fromUnit / toUnit
  for (const slot of slots) {
    const { day, hour, minute } = parseSlot(slot)
    for (let i = 0; i < ratio; i++) {
      const newMinute = minute + i * toUnit
      const extraHours = Math.floor(newMinute / 60)
      const finalMinute = newMinute % 60
      expanded.push(makeSlot(day, hour + extraHours, finalMinute))
    }
  }
  return expanded
}

// 제출된 멤버들 중 가장 작은 시간 단위 반환
export function getSmallestTimeUnit(schedules) {
  let smallest = 60
  for (const name of Object.keys(schedules)) {
    const data = schedules[name]
    if (data && data.timeUnit && data.timeUnit < smallest) {
      smallest = data.timeUnit
    }
  }
  return smallest
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

// 슬롯을 분 단위 총합으로 변환 (정렬용)
function slotToMinutes(slot) {
  const { hour, minute } = parseSlot(slot)
  return hour * 60 + minute
}

// 슬롯을 요일별로 그룹화하여 연속 시간대로 합치기
function groupConsecutiveSlots(slots, timeUnit) {
  const byDay = {}
  slots.forEach(slot => {
    const { day, hour, minute } = parseSlot(slot)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push({ hour, minute, total: hour * 60 + minute })
  })

  const groups = []
  for (const [day, items] of Object.entries(byDay)) {
    items.sort((a, b) => a.total - b.total)
    let startItem = items[0]
    let endItem = items[0]
    for (let i = 1; i < items.length; i++) {
      if (items[i].total === endItem.total + timeUnit) {
        endItem = items[i]
      } else {
        // 끝 시간은 마지막 슬롯 + timeUnit
        const endTotal = endItem.total + timeUnit
        groups.push({
          day,
          start: startItem.hour,
          startMinute: startItem.minute,
          end: Math.floor(endTotal / 60),
          endMinute: endTotal % 60
        })
        startItem = items[i]
        endItem = items[i]
      }
    }
    const endTotal = endItem.total + timeUnit
    groups.push({
      day,
      start: startItem.hour,
      startMinute: startItem.minute,
      end: Math.floor(endTotal / 60),
      endMinute: endTotal % 60
    })
  }
  return groups
}

// 연속 시간대를 읽기 쉬운 텍스트로 변환
export function formatTimeRange(day, start, end, startMinute = 0, endMinute = 0) {
  const dayLabel = DAYS.find(d => d.key === day)?.label || day
  return `${dayLabel}요일 ${formatHour(start, startMinute)}~${formatHour(end, endMinute)}`
}

/**
 * 메인 분석 함수 — 모든 멤버의 스케줄을 분석하여 추천 결과 생성
 * @param {Object} schedules - Firestore에서 가져온 스케줄 데이터
 * @param {Array} members - 멤버 목록 [{name, class}, ...]
 * @param {Object} timeRange - {start, end} 시간 범위
 * @returns {Object} 분석 결과
 */
export function analyzeSchedules(schedules, members, timeRange) {
  const submittedMembers = members.filter(m => schedules[m.name])

  // 가장 작은 시간 단위 결정
  const analysisUnit = getSmallestTimeUnit(schedules)
  const allSlots = generateAllSlots(timeRange, analysisUnit)

  // 멤버별 가능 슬롯 집합을 미리 계산 (개인 범위 안)
  // 반환: Map<memberName, { range, outsideMode, availableSet: Set<slot> }>
  const memberCache = new Map()
  for (const member of submittedMembers) {
    const memberData = schedules[member.name]
    const memberRange = memberData.timeRange || timeRange
    const memberOutsideMode = memberData.outsideMode || 'unavailable'
    const memberUnit = memberData.timeUnit || 60
    const expandedSlots = expandSlots(memberData.slots || [], memberUnit, analysisUnit)
    // 개인 범위로 제한한 슬롯 전체 집합
    const memberAllSlots = generateAllSlots(memberRange, analysisUnit)
    const memberAvailable = getAvailableSlots(
      { ...memberData, slots: expandedSlots },
      memberAllSlots
    )
    memberCache.set(member.name, {
      range: memberRange,
      outsideMode: memberOutsideMode,
      availableSet: new Set(memberAvailable)
    })
  }

  // 슬롯이 해당 멤버에게 가능한지 판정
  const isMemberAvailableAt = (memberName, slot) => {
    const cache = memberCache.get(memberName)
    if (!cache) return false
    const { hour } = parseSlot(slot)
    const inRange = hour >= cache.range.start && hour <= cache.range.end
    if (inRange) return cache.availableSet.has(slot)
    return cache.outsideMode === 'available'
  }

  // 각 슬롯별 가능/불가능 멤버 집계
  const slotAvailability = {}
  for (const slot of allSlots) {
    slotAvailability[slot] = {
      available: [],
      unavailable: []
    }
    for (const member of submittedMembers) {
      if (isMemberAvailableAt(member.name, slot)) {
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
  const allAvailableGroups = groupConsecutiveSlots(allAvailable, analysisUnit)

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
  const rawAdjustments = []
  const seenKeys = new Set()
  for (const item of oneMissing) {
    const { day, hour, minute } = parseSlot(item.slot)
    const missingName = item.missing[0]
    const dayLabel = DAYS.find(d => d.key === day)?.label || day

    // ±1~2 슬롯 단위로 인접 확인
    for (const offsetSlots of [1, -1, 2, -2]) {
      const totalMinutes = hour * 60 + minute + offsetSlots * analysisUnit
      const nearbyHour = Math.floor(totalMinutes / 60)
      const nearbyMinute = totalMinutes % 60
      if (nearbyHour < timeRange.start || nearbyHour > timeRange.end) continue
      const nearbySlot = makeSlot(day, nearbyHour, nearbyMinute)
      // 제안된 인접 슬롯에서 빠졌던 멤버가 정말 가능해야 하고,
      // 나머지 전원도 그 슬롯에 가능해야 함
      if (!isMemberAvailableAt(missingName, nearbySlot)) continue
      const othersAvailable = submittedMembers.every(m =>
        m.name === missingName || isMemberAvailableAt(m.name, nearbySlot)
      )
      if (!othersAvailable) continue

      const key = `${item.slot}|${missingName}|${nearbySlot}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      const direction = offsetSlots > 0 ? '앞당기면' : '늦추면'
      const offsetLabel = Math.abs(offsetSlots) === 1
        ? `${analysisUnit}분`
        : `${analysisUnit * Math.abs(offsetSlots)}분`
      rawAdjustments.push({
        targetSlot: item.slot,
        missingMember: missingName,
        nearbySlot,
        offset: Math.abs(offsetSlots),
        direction,
        description: `${dayLabel}요일 ${formatHour(hour, minute)}에 ${missingName}님 불가 → ${formatHour(nearbyHour, nearbyMinute)}에서 ${offsetLabel} ${direction} 전원 가능`
      })
    }
  }

  // 정렬: ±1슬롯 제안 우선
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
    submittedCount: submittedMembers.length,
    analysisUnit
  }
}

/**
 * 결과를 클립보드용 텍스트로 변환
 */
export function formatResultText(result, members, schedules = {}) {
  let text = `📅 이번주 아티 성역 스케줄 결과\n\n`

  // 전원 가능
  if (result.allAvailableGroups.length > 0) {
    text += `✅ 전원 가능:\n`
    result.allAvailableGroups.forEach(g => {
      text += `- ${formatTimeRange(g.day, g.start, g.end, g.startMinute, g.endMinute)}\n`
    })
    text += '\n'
  } else {
    text += `❌ 전원 가능한 시간이 없습니다.\n\n`
  }

  // 1명 조율 필요
  if (result.oneMissing.length > 0) {
    text += `⚠️ 거의 가능 (1명 조율 필요):\n`
    const seen = new Set()
    result.oneMissing.forEach(item => {
      const { day, hour, minute } = parseSlot(item.slot)
      const dayLabel = DAYS.find(d => d.key === day)?.label
      const key = `${dayLabel}요일 ${formatHour(hour, minute)}`
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

  // 메모
  const memos = members
    .filter(m => schedules[m.name]?.memo)
    .map(m => `- ${m.name}: ${schedules[m.name].memo}`)
  if (memos.length > 0) {
    text += `\n💬 메모:\n${memos.join('\n')}\n`
  }

  return text
}
