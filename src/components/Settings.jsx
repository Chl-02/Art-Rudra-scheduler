import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore'

// 직업 목록 (드롭다운용)
const CLASS_OPTIONS = [
  '호법성', '치유성', '궁성', '마도성', '수호성', '암살성', '음유성', '정령성'
]

// 설정 화면 컴포넌트
// 팀 멤버 수정, 시간 범위 설정, 전체 초기화 기능
export default function Settings({ config, onBack }) {
  const [members, setMembers] = useState([])
  const [timeStart, setTimeStart] = useState(20)
  const [timeEnd, setTimeEnd] = useState(25)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  // 설정값 로드
  useEffect(() => {
    if (config) {
      setMembers(config.members?.map(m => ({ ...m })) || [])
      setTimeStart(config.timeRange?.start || 20)
      setTimeEnd(config.timeRange?.end || 25)
    }
  }, [config])

  // 멤버 이름 변경
  const updateMemberName = (idx, name) => {
    setMembers(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], name }
      return next
    })
    setSaved(false)
  }

  // 멤버 직업 변경
  const updateMemberClass = (idx, cls) => {
    setMembers(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], class: cls }
      return next
    })
    setSaved(false)
  }

  // 멤버 추가
  const addMember = () => {
    setMembers(prev => [...prev, { name: '', class: '호법성' }])
    setSaved(false)
  }

  // 멤버 삭제
  const removeMember = (idx) => {
    if (members.length <= 2) {
      alert('최소 2명의 멤버가 필요합니다.')
      return
    }
    setMembers(prev => prev.filter((_, i) => i !== idx))
    setSaved(false)
  }

  // 설정 저장
  const handleSave = async () => {
    // 빈 이름 체크
    const emptyNames = members.filter(m => !m.name.trim())
    if (emptyNames.length > 0) {
      alert('모든 멤버의 닉네임을 입력해주세요.')
      return
    }

    // 중복 이름 체크
    const names = members.map(m => m.name.trim())
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
    if (duplicates.length > 0) {
      alert(`중복된 닉네임이 있습니다: ${duplicates.join(', ')}`)
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'config', 'settings'), {
        members: members.map(m => ({
          name: m.name.trim(),
          class: m.class
        })),
        timeRange: { start: timeStart, end: timeEnd }
      })
      setSaved(true)
    } catch (error) {
      console.error('설정 저장 실패:', error)
      alert('저장에 실패했습니다. Firebase 설정을 확인해주세요.')
    }
    setSaving(false)
  }

  // 전체 스케줄 초기화 (새 주차 시작)
  const handleReset = async () => {
    setResetting(true)
    try {
      // 현재 스케줄 데이터 백업 (히스토리에 저장)
      const scheduleRef = doc(db, 'schedules', 'current')
      const scheduleSnap = await getDoc(scheduleRef)

      if (scheduleSnap.exists()) {
        const currentData = scheduleSnap.data()
        // 히스토리에 보관
        await addDoc(collection(db, 'history'), {
          archivedAt: new Date().toISOString(),
          data: currentData
        })
      }

      // 현재 스케줄 초기화 (빈 문서로 덮어쓰기)
      await setDoc(scheduleRef, {})

      setShowResetConfirm(false)
      alert('모든 스케줄이 초기화되었습니다. 새로운 주차를 시작하세요!')
    } catch (error) {
      console.error('초기화 실패:', error)
      alert('초기화에 실패했습니다.')
    }
    setResetting(false)
  }

  // 시간 표시 (시작~끝)
  const formatSettingHour = (h) => {
    const hour = h >= 24 ? h - 24 : h
    if (hour === 0) return '자정(0시)'
    return `${hour}시`
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h2 className="settings-title">⚙️ 길드 설정</h2>
        <p className="settings-subtitle">팀 구성과 시간 범위를 관리합니다</p>
      </div>

      {/* 멤버 편집 */}
      <div className="settings-section">
        <h3 className="section-title">👥 팀 멤버 관리</h3>
        <div className="member-edit-list">
          {members.map((member, idx) => (
            <div key={idx} className="member-edit-row">
              <span className="member-number">{idx + 1}</span>
              <input
                type="text"
                className="input-field"
                placeholder="닉네임"
                value={member.name}
                onChange={(e) => updateMemberName(idx, e.target.value)}
                maxLength={20}
              />
              <select
                className="select-field"
                value={member.class}
                onChange={(e) => updateMemberClass(idx, e.target.value)}
              >
                {CLASS_OPTIONS.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
              <button
                className="btn btn-icon btn-danger-outline"
                onClick={() => removeMember(idx)}
                title="멤버 삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn-outline btn-add-member" onClick={addMember}>
          + 멤버 추가
        </button>
      </div>

      {/* 시간 범위 설정 */}
      <div className="settings-section">
        <h3 className="section-title">🕐 시간 범위 설정</h3>
        <div className="time-range-setting">
          <div className="time-range-input">
            <label>시작 시간</label>
            <select
              className="select-field"
              value={timeStart}
              onChange={(e) => { setTimeStart(Number(e.target.value)); setSaved(false) }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatSettingHour(i)}</option>
              ))}
              {/* 다음 날 시간 (24~30 = 자정~오전6시) */}
              {Array.from({ length: 7 }, (_, i) => (
                <option key={i + 24} value={i + 24}>
                  다음날 {formatSettingHour(i + 24)}
                </option>
              ))}
            </select>
          </div>
          <span className="time-range-separator">~</span>
          <div className="time-range-input">
            <label>종료 시간</label>
            <select
              className="select-field"
              value={timeEnd}
              onChange={(e) => { setTimeEnd(Number(e.target.value)); setSaved(false) }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatSettingHour(i)}</option>
              ))}
              {Array.from({ length: 7 }, (_, i) => (
                <option key={i + 24} value={i + 24}>
                  다음날 {formatSettingHour(i + 24)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="setting-hint">
          현재: {formatSettingHour(timeStart)} ~ {formatSettingHour(timeEnd)}
          ({timeEnd - timeStart + 1}시간 범위)
        </p>
      </div>

      {/* 전체 초기화 */}
      <div className="settings-section settings-danger">
        <h3 className="section-title">🔄 스케줄 전체 초기화</h3>
        <p className="setting-hint">
          새로운 주차를 시작할 때 사용합니다. 기존 데이터는 히스토리에 보관됩니다.
        </p>
        {!showResetConfirm ? (
          <button
            className="btn btn-danger"
            onClick={() => setShowResetConfirm(true)}
          >
            🗑️ 전체 초기화
          </button>
        ) : (
          <div className="reset-confirm">
            <p className="reset-warning">
              ⚠️ 정말 초기화하시겠습니까?<br />
              모든 멤버의 시간 데이터가 초기화됩니다.
            </p>
            <div className="reset-buttons">
              <button
                className="btn btn-danger"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? '초기화 중...' : '확인, 초기화합니다'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setShowResetConfirm(false)}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="settings-footer">
        <button className="btn btn-outline" onClick={onBack}>
          ← 돌아가기
        </button>
        <button
          className={`btn btn-gold ${saved ? 'btn-saved' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '저장 중...' : saved ? '✓ 저장 완료!' : '💾 설정 저장'}
        </button>
      </div>
    </div>
  )
}
