import { useState, useCallback, useRef, useEffect } from 'react'
import { db } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { DAYS, formatHourShort, makeSlot } from '../utils/scheduler'

// 시간 입력 화면 컴포넌트
// 요일 × 시간 격자에서 드래그/탭으로 가능한 시간 선택
export default function TimeInput({ member, config, schedules, onBack }) {
  const timeRange = config?.timeRange || { start: 20, end: 25 }
  const hours = []
  for (let h = timeRange.start; h <= timeRange.end; h++) {
    hours.push(h)
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

  const gridRef = useRef(null)

  // 기존 데이터 로드
  useEffect(() => {
    if (member && schedules[member.name]) {
      const data = schedules[member.name]
      setSelectedSlots(new Set(data.slots || []))
      setMode(data.mode || 'available')
    }
  }, [member, schedules])

  // 모든 슬롯 목록 생성
  const allSlots = []
  DAYS.forEach(({ key }) => {
    hours.forEach(h => {
      allSlots.push(makeSlot(key, h))
    })
  })

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
    const daySlots = hours.map(h => makeSlot(dayKey, h))
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

  // 모드 전환
  const toggleMode = () => {
    setMode(prev => prev === 'available' ? 'unavailable' : 'available')
    clearAll()
  }

  // Firebase에 저장
  const handleSave = async () => {
    if (!member) return
    setSaving(true)
    try {
      const scheduleRef = doc(db, 'schedules', 'current')
      // 기존 문서가 있는지 확인
      const scheduleSnap = await getDoc(scheduleRef)
      const currentData = scheduleSnap.exists() ? scheduleSnap.data() : {}

      await setDoc(scheduleRef, {
        ...currentData,
        [member.name]: {
          slots: Array.from(selectedSlots),
          mode,
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
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('touchend', endDrag)
    return () => {
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('touchend', endDrag)
    }
  }, [handleDragEnd])

  return (
    <div className="time-input">
      {/* 헤더: 멤버 정보 */}
      <div className="input-header">
        <h2 className="input-title">
          ⏰ {member?.name}님의 운명의 시간
        </h2>
        <p className="input-subtitle">
          {mode === 'available'
            ? '가능한 시간을 선택하세요 (드래그로 여러 칸 선택 가능)'
            : '불가능한 시간을 선택하세요 (나머지는 자동으로 가능 처리)'}
        </p>
      </div>

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
        <table className="time-grid">
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
            {hours.map(hour => (
              <tr key={hour}>
                <td className="hour-label">{formatHourShort(hour)}</td>
                {DAYS.map(({ key }) => {
                  const slot = makeSlot(key, hour)
                  const isSelected = selectedSlots.has(slot)
                  return (
                    <td
                      key={slot}
                      data-slot={slot}
                      className={`time-cell ${isSelected ? (mode === 'available' ? 'cell-available' : 'cell-unavailable') : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleDragStart(slot)
                      }}
                      onMouseEnter={() => handleDragOver(slot)}
                      onTouchStart={(e) => {
                        handleDragStart(slot)
                      }}
                    >
                      {isSelected && (mode === 'available' ? '✓' : '✗')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
            disabled={saving}
          >
            {saving ? '각인 중...' : saved ? '✓ 각인 완료!' : '⚡ 시간 각인하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
