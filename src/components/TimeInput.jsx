import { useState, useCallback, useRef, useEffect } from 'react'
import { db } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { DAYS, formatHourShort, makeSlot, generateAllSlots, parseSlot } from '../utils/scheduler'
import { parseNaturalLanguage, isNlpConfigured } from '../utils/naturalLanguage'

const TIME_UNIT_OPTIONS = [
  { value: 60, label: '1시간' },
  { value: 30, label: '30분' },
  { value: 10, label: '10분' }
]

// 시간 단위(분)를 기본값으로 설정 화면에서 내려주는 시간 표시
function formatSettingHour(h) {
  const hour = h >= 24 ? h - 24 : h
  if (hour === 0) return '자정(0시)'
  return `${hour}시`
}

// 시간 입력 화면 컴포넌트
// 요일 × 시간 격자에서 드래그/탭으로 가능한 시간 선택
export default function TimeInput({ member, config, schedules, onBack }) {
  const defaultRange = config?.timeRange || { start: 20, end: 25 }
  const defaultUnit = config?.timeUnit || 60

  // 시간 단위 (개인 선택)
  const [timeUnit, setTimeUnit] = useState(defaultUnit)

  // 개인 시간 범위 (멤버별)
  const [personalRange, setPersonalRange] = useState(defaultRange)
  // 표시 범위 밖 시간의 일괄 처리 모드
  const [outsideMode, setOutsideMode] = useState('unavailable')
  // 범위 설정 패널 표시 여부
  const [showRangeSettings, setShowRangeSettings] = useState(false)

  // 범위 유효성
  const rangeValid = personalRange.end >= personalRange.start

  // 시간 행 목록 생성 (시간 단위에 따라)
  const timeRows = []
  const stepsPerHour = 60 / timeUnit
  if (rangeValid) {
    for (let h = personalRange.start; h <= personalRange.end; h++) {
      for (let s = 0; s < stepsPerHour; s++) {
        timeRows.push({ hour: h, minute: s * timeUnit })
      }
    }
  }

  // 선택된 슬롯 (Set<string>)
  const [selectedSlots, setSelectedSlots] = useState(new Set())
  // 입력 모드: 'available'(가능한 시간 선택) / 'unavailable'(불가능한 시간 선택)
  const [mode, setMode] = useState('available')
  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false)
  const [dragAction, setDragAction] = useState(null) // 'add' or 'remove'
  // 저장 상태
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // 메모
  const [memo, setMemo] = useState('')
  // 자연어 입력 상태
  const [nlpText, setNlpText] = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [nlpError, setNlpError] = useState('')
  const [nlpNotes, setNlpNotes] = useState('')
  // 터치/마우스 충돌 방지
  const isTouchDevice = useRef(false)

  const gridRef = useRef(null)

  // 기존 데이터 로드 — 멤버가 바뀔 때 1회만 실행 (schedules 스냅샷 변경으로 인한 오버라이트 방지)
  const loadedForMember = useRef(null)
  useEffect(() => {
    if (!member) {
      loadedForMember.current = null
      return
    }
    if (loadedForMember.current === member.name) return
    if (schedules[member.name]) {
      const data = schedules[member.name]
      setSelectedSlots(new Set(data.slots || []))
      setMode(data.mode || 'available')
      setMemo(data.memo || '')
      if (data.timeUnit) setTimeUnit(data.timeUnit)
      if (data.timeRange) setPersonalRange(data.timeRange)
      if (data.outsideMode) setOutsideMode(data.outsideMode)
      setSaved(true)
      loadedForMember.current = member.name
    }
  }, [member, schedules])

  // 모든 슬롯 목록 생성
  const allSlots = rangeValid ? generateAllSlots(personalRange, timeUnit) : []

  // 슬롯 토글 (단일 클릭)
  const toggleSlot = useCallback((slot) => {
    setSelectedSlots(prev => {
      const next = new Set(prev)
      if (next.has(slot)) {
        next.delete(slot)
      } else {
        next.add(slot)
      }
      return next
    })
    setSaved(false)
  }, [])

  // 드래그 시작
  const handleDragStart = useCallback((slot) => {
    setIsDragging(true)
    // 첫 번째 셀의 상태에 따라 추가/제거 결정
    const action = selectedSlots.has(slot) ? 'remove' : 'add'
    setDragAction(action)
    setSelectedSlots(prev => {
      const next = new Set(prev)
      if (action === 'add') next.add(slot)
      else next.delete(slot)
      return next
    })
    setSaved(false)
  }, [selectedSlots])

  // 드래그 중 (마우스가 셀 위로 이동)
  const handleDragOver = useCallback((slot) => {
    if (!isDragging) return
    setSelectedSlots(prev => {
      const next = new Set(prev)
      if (dragAction === 'add') next.add(slot)
      else next.delete(slot)
      return next
    })
  }, [isDragging, dragAction])

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    setDragAction(null)
  }, [])

  // 터치 이벤트 처리 (모바일 드래그)
  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return
    e.preventDefault()
    const touch = e.touches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    if (element?.dataset?.slot) {
      handleDragOver(element.dataset.slot)
    }
  }, [isDragging, handleDragOver])

  // 전체 선택
  const selectAll = () => {
    setSelectedSlots(new Set(allSlots))
    setSaved(false)
  }

  // 전체 해제 (초기화)
  const clearAll = () => {
    setSelectedSlots(new Set())
    setSaved(false)
  }

  // 요일 전체 선택/해제 토글
  const toggleDay = (dayKey) => {
    const daySlots = timeRows.map(({ hour, minute }) => makeSlot(dayKey, hour, minute))
    const allSelected = daySlots.every(s => selectedSlots.has(s))
    setSelectedSlots(prev => {
      const next = new Set(prev)
      daySlots.forEach(s => {
        if (allSelected) next.delete(s)
        else next.add(s)
      })
      return next
    })
    setSaved(false)
  }

  // 시간 행 전체 선택/해제 토글 (해당 시간의 모든 요일)
  const toggleTimeRow = (hour, minute) => {
    const rowSlots = DAYS.map(({ key }) => makeSlot(key, hour, minute))
    const allSelected = rowSlots.every(s => selectedSlots.has(s))
    setSelectedSlots(prev => {
      const next = new Set(prev)
      rowSlots.forEach(s => {
        if (allSelected) next.delete(s)
        else next.add(s)
      })
      return next
    })
    setSaved(false)
  }

  // 모드 전환
  const toggleMode = () => {
    setMode(prev => prev === 'available' ? 'unavailable' : 'available')
    clearAll()
  }

  // 시간 단위 변경
  const handleTimeUnitChange = (unit) => {
    setTimeUnit(unit)
    setSelectedSlots(new Set())
    setSaved(false)
  }

  // 자연어 입력으로 슬롯 적용
  // mode를 반환 mode에 맞춰 갈아끼우고, slots를 기존 선택에 합집합 병합
  const handleNlpApply = async () => {
    setNlpError('')
    setNlpNotes('')
    if (!nlpText.trim()) {
      setNlpError('문장을 입력해주세요.')
      return
    }
    if (!rangeValid) {
      setNlpError('시간 범위가 유효하지 않습니다.')
      return
    }
    setNlpLoading(true)
    try {
      const result = await parseNaturalLanguage(nlpText, {
        timeRange: personalRange,
        timeUnit
      })
      // 슬롯 범위/단위 한 번 더 방어적 필터링
      const allSet = new Set(allSlots)
      const accepted = result.slots.filter(s => allSet.has(s))
      // 기존 선택을 항상 덮어쓰기 (자연어 문장이 "전체 상태"를 기술한다고 본다)
      setMode(result.mode)
      setSelectedSlots(new Set(accepted))
      const skipped = result.slots.length - accepted.length
      const noteParts = [
        `${accepted.length}개 슬롯 적용됨`,
        skipped > 0 ? `${skipped}개는 범위 밖이라 제외` : '',
        result.notes
      ].filter(Boolean)
      setNlpNotes(noteParts.join(' · '))
      setSaved(false)
    } catch (e) {
      setNlpError(e?.message || '파싱 실패')
    } finally {
      setNlpLoading(false)
    }
  }

  // Firebase에 저장
  const handleSave = async () => {
    if (!member) return
    if (!rangeValid) {
      alert('종료 시간이 시작 시간보다 빨라 저장할 수 없습니다.')
      return
    }
    setSaving(true)
    try {
      const scheduleRef = doc(db, 'schedules', 'current')
      // 기존 문서가 있는지 확인
      const scheduleSnap = await getDoc(scheduleRef)
      const currentData = scheduleSnap.exists() ? scheduleSnap.data() : {}

      // 현재 개인 범위 밖의 고아 슬롯 제거
      const cleanedSlots = Array.from(selectedSlots).filter(s => {
        const { hour } = parseSlot(s)
        return hour >= personalRange.start && hour <= personalRange.end
      })

      await setDoc(scheduleRef, {
        ...currentData,
        [member.name]: {
          slots: cleanedSlots,
          mode,
          timeUnit,
          timeRange: personalRange,
          outsideMode,
          memo: memo.trim(),
          updatedAt: new Date().toISOString()
        }
      })
      setSaved(true)
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장에 실패했습니다. Firebase 설정을 확인해주세요.')
    }
    setSaving(false)
  }

  // 전역 마우스업/터치엔드 리스너 (드래그 종료)
  useEffect(() => {
    const endDrag = () => handleDragEnd()
    const endTouch = () => {
      handleDragEnd()
      // 300ms 후 터치 플래그 리셋 (합성 mouse 이벤트 차단 후 해제)
      setTimeout(() => { isTouchDevice.current = false }, 300)
    }
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('touchend', endTouch)
    return () => {
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('touchend', endTouch)
    }
  }, [handleDragEnd])

  return (
    <div className="time-input">
      {/* 헤더: 멤버 정보 */}
      <div className="input-header">
        <h2 className="input-title">
          ⏰ {member?.name}님 시간
        </h2>
        <p className="input-subtitle">
          {mode === 'available'
            ? '가능한 시간을 선택하세요 (드래그로 여러 칸 선택 가능, 요일/시간 클릭 시 해당 행·열 전체 선택, 아래 버튼으로 불가능한 시간 선택 모드 전환 가능)'
            : '불가능한 시간을 선택하세요 (나머지는 자동으로 가능 처리, 요일/시간 클릭 시 해당 행·열 전체 선택, 아래 버튼으로 가능한 시간 선택 모드 전환 가능)'}
        </p>
      </div>

      {/* 시간 단위 선택 */}
      <div className="time-unit-selector">
        <span className="time-unit-label">시간 단위:</span>
        <div className="time-unit-buttons">
          {TIME_UNIT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`btn btn-unit-sm ${timeUnit === opt.value ? 'btn-unit-active' : 'btn-outline'}`}
              onClick={() => handleTimeUnitChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 개인 시간 범위 설정 & 범위 밖 토글 */}
      <div className="input-settings-row">
        <button
          className="btn btn-outline btn-unit-sm"
          onClick={() => setShowRangeSettings(v => !v)}
          title="개인 시간 범위 설정"
        >
          ⚙️ 시간 범위 {formatSettingHour(personalRange.start)}~{formatSettingHour(personalRange.end)} {showRangeSettings ? '▲' : '▼'}
        </button>
        <button
          className={`btn btn-mode btn-unit-sm ${outsideMode === 'available' ? 'mode-available' : 'mode-unavailable'}`}
          onClick={() => { setOutsideMode(m => m === 'available' ? 'unavailable' : 'available'); setSaved(false) }}
          title="표시 범위 밖 시간을 어떻게 처리할지"
        >
          범위 밖: {outsideMode === 'available' ? '✅ 가능' : '❌ 불가'}
        </button>
      </div>

      {showRangeSettings && (
        <div className="personal-range-panel">
          <div className="time-range-setting">
            <div className="time-range-input">
              <label>시작 시간</label>
              <select
                className="select-field"
                value={personalRange.start}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setPersonalRange(r => ({ ...r, start: v }))
                  setSaved(false)
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatSettingHour(i)}</option>
                ))}
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i + 24} value={i + 24}>다음날 {formatSettingHour(i + 24)}</option>
                ))}
              </select>
            </div>
            <span className="time-range-separator">~</span>
            <div className="time-range-input">
              <label>종료 시간</label>
              <select
                className="select-field"
                value={personalRange.end}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setPersonalRange(r => ({ ...r, end: v }))
                  setSaved(false)
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{formatSettingHour(i)}</option>
                ))}
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i + 24} value={i + 24}>다음날 {formatSettingHour(i + 24)}</option>
                ))}
              </select>
            </div>
          </div>
          {!rangeValid && (
            <p className="setting-warning">⚠️ 종료 시간이 시작 시간보다 빠릅니다.</p>
          )}
          <p className="setting-hint">
            이 범위는 나만의 입력 표 크기입니다. 범위 밖 시간은 위의 "범위 밖" 토글로 일괄 처리됩니다.
          </p>
        </div>
      )}

      {/* 자연어 입력 패널 (기본 표시) */}
      {isNlpConfigured() && (
        <div className="nlp-panel">
          <div className="nlp-hint">
            ✨ 자연어 입력 — 예: <em>"월수금 6~10시 가능, 주말 전부 가능"</em>, <em>"목금 빼고 다 가능"</em>, <em>"주말은 8시 이후만"</em>
          </div>
          <div className="nlp-input-row">
            <input
              type="text"
              className="input-field nlp-input"
              placeholder="자연어로 일정을 설명하세요 (시간은 기본 오후로 해석)"
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !nlpLoading) handleNlpApply()
              }}
              maxLength={500}
              disabled={nlpLoading}
            />
            <button
              className="btn btn-gold"
              onClick={handleNlpApply}
              disabled={nlpLoading || !nlpText.trim()}
            >
              {nlpLoading ? '파싱 중...' : '✨ 적용'}
            </button>
          </div>
          {nlpError && <p className="nlp-error">⚠️ {nlpError}</p>}
          {nlpNotes && <p className="nlp-notes">💡 {nlpNotes}</p>}
        </div>
      )}

      {/* 컨트롤 버튼들 */}
      <div className="input-controls">
        <button
          className={`btn btn-mode ${mode === 'available' ? 'mode-available' : 'mode-unavailable'}`}
          onClick={toggleMode}
        >
          {mode === 'available' ? '✅ 가능한 시간 선택 중' : '❌ 불가능한 시간 선택 중'}
        </button>
        <button className="btn btn-outline" onClick={selectAll}>
          전체 선택
        </button>
        <button className="btn btn-outline btn-danger-outline" onClick={clearAll}>
          초기화
        </button>
      </div>

      {/* 시간 격자 */}
      <div
        className="time-grid-container"
        ref={gridRef}
        onTouchMove={handleTouchMove}
      >
        <table className={`time-grid ${timeUnit < 60 ? 'time-grid-compact' : ''}`}>
          <thead>
            <tr>
              <th className="time-header-corner"></th>
              {DAYS.map(({ key, label }) => (
                <th
                  key={key}
                  className="day-header"
                  onClick={() => toggleDay(key)}
                  title={`${label}요일 전체 선택/해제`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRows.map(({ hour, minute }) => (
              <tr key={`${hour}:${minute}`}>
                <td
                  className={`hour-label ${minute > 0 ? 'hour-label-sub' : ''}`}
                  onClick={() => toggleTimeRow(hour, minute)}
                  title={`${formatHourShort(hour, minute)} 전체 요일 선택/해제`}
                >
                  {formatHourShort(hour, minute)}
                </td>
                {DAYS.map(({ key }) => {
                  const slot = makeSlot(key, hour, minute)
                  const isSelected = selectedSlots.has(slot)
                  return (
                    <td
                      key={slot}
                      data-slot={slot}
                      className={`time-cell ${timeUnit < 60 ? 'time-cell-compact' : ''} ${isSelected
                        ? (mode === 'available' ? 'cell-available' : 'cell-unavailable')
                        : (saved ? (mode === 'available' ? 'cell-unavailable' : 'cell-available') : '')}`}
                      onMouseDown={(e) => {
                        if (isTouchDevice.current) return
                        e.preventDefault()
                        handleDragStart(slot)
                      }}
                      onMouseEnter={() => {
                        if (isTouchDevice.current) return
                        handleDragOver(slot)
                      }}
                      onTouchStart={() => {
                        isTouchDevice.current = true
                        handleDragStart(slot)
                      }}
                    >
                      {isSelected
                        ? (mode === 'available' ? '✓' : '✗')
                        : (saved ? (mode === 'available' ? '✗' : '✓') : '')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 메모 입력 */}
      <div className="memo-input-section">
        <input
          type="text"
          className="input-field memo-input"
          placeholder="한 줄 메모 (선택사항)"
          value={memo}
          onChange={(e) => { setMemo(e.target.value); setSaved(false) }}
          maxLength={100}
        />
      </div>

      {/* 선택 현황 & 저장 */}
      <div className="input-footer">
        <div className="selection-count">
          {mode === 'available'
            ? `${selectedSlots.size}개 시간 선택됨`
            : `${selectedSlots.size}개 불가 시간 선택됨 (${allSlots.length - selectedSlots.size}개 가능)`}
        </div>
        <div className="footer-buttons">
          <button className="btn btn-outline" onClick={onBack}>
            ← 돌아가기
          </button>
          <button
            className={`btn btn-gold btn-large ${saved ? 'btn-saved' : ''}`}
            onClick={handleSave}
            disabled={saving || !rangeValid}
          >
            {saving ? '저장 중...' : saved ? '✓ 선택 완료!' : '⚡ 시간 선택하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
