import { useMemo, useState } from 'react'
import {
  DAYS, formatHour, formatHourShort, formatTimeRange,
  analyzeSchedules, formatResultText, makeSlot, parseSlot
} from '../utils/scheduler'

// 결과 화면 컴포넌트
// 겹치는 시간 분석 + 히트맵 + 스마트 추천 + 텍스트 복사
export default function Results({ config, schedules, onBack }) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('recommend') // 'recommend' | 'heatmap'

  const timeRange = config?.timeRange || { start: 20, end: 25 }
  const members = config?.members || []
  const hours = []
  for (let h = timeRange.start; h <= timeRange.end; h++) {
    hours.push(h)
  }

  // 스케줄 분석 (메모이제이션)
  const result = useMemo(
    () => analyzeSchedules(schedules, members, timeRange),
    [schedules, members, timeRange]
  )

  // 클립보드 복사
  const handleCopy = async () => {
    const text = formatResultText(result, members)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 폴백: textarea를 이용한 복사
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 히트맵 셀 색상 계산 (가능 인원 수에 따른 골드 그라데이션)
  const getHeatmapColor = (count) => {
    if (result.totalMembers === 0) return 'transparent'
    const ratio = count / result.totalMembers
    if (ratio === 0) return 'rgba(201, 168, 76, 0.03)'
    if (ratio <= 0.25) return 'rgba(201, 168, 76, 0.12)'
    if (ratio <= 0.5) return 'rgba(201, 168, 76, 0.25)'
    if (ratio <= 0.75) return 'rgba(201, 168, 76, 0.45)'
    if (ratio < 1) return 'rgba(201, 168, 76, 0.65)'
    return 'rgba(240, 208, 96, 0.85)' // 전원 가능
  }

  return (
    <div className="results">
      {/* 헤더 */}
      <div className="results-header">
        <h2 className="results-title">📊 운명의 시간 결과</h2>
        <p className="results-subtitle">
          {result.submittedCount}/{members.length}명 등록 완료
        </p>
      </div>

      {/* 탭 전환 */}
      <div className="results-tabs">
        <button
          className={`tab-btn ${activeTab === 'recommend' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommend')}
        >
          ⚡ 스마트 추천
        </button>
        <button
          className={`tab-btn ${activeTab === 'heatmap' ? 'active' : ''}`}
          onClick={() => setActiveTab('heatmap')}
        >
          🗺️ 히트맵
        </button>
      </div>

      {/* 스마트 추천 탭 */}
      {activeTab === 'recommend' && (
        <div className="recommend-section">
          {result.submittedCount === 0 ? (
            <div className="empty-result">
              <p>아직 아무도 시간을 등록하지 않았습니다.</p>
              <p>용사들의 시간 각인을 기다리는 중...</p>
            </div>
          ) : (
            <>
              {/* ✅ 전원 가능 시간 */}
              <div className="result-card result-all-available">
                <h3 className="result-card-title">
                  <span className="result-icon">✅</span> 전원 가능 시간
                </h3>
                {result.allAvailableGroups.length > 0 ? (
                  <ul className="result-list">
                    {result.allAvailableGroups.map((g, i) => (
                      <li key={i} className="result-item result-item-gold">
                        {formatTimeRange(g.day, g.start, g.end)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-result">전원이 모두 가능한 시간이 없습니다</p>
                )}
              </div>

              {/* ⚠️ 1명 조율 필요 */}
              {result.oneMissing.length > 0 && (
                <div className="result-card result-one-missing">
                  <h3 className="result-card-title">
                    <span className="result-icon">⚠️</span> 1명만 조율하면 가능
                  </h3>
                  <ul className="result-list">
                    {result.oneMissing.slice(0, 10).map((item, i) => {
                      const { day, hour } = parseSlot(item.slot)
                      const dayLabel = DAYS.find(d => d.key === day)?.label
                      return (
                        <li key={i} className="result-item">
                          <span className="result-time">
                            {dayLabel}요일 {formatHour(hour)}
                          </span>
                          <span className="result-detail">
                            {item.count}/{item.total}명 가능
                            <span className="missing-name">({item.missing.join(', ')}님 불가)</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* 🔄 조율 제안 */}
              {result.adjustments.length > 0 && (
                <div className="result-card result-adjustments">
                  <h3 className="result-card-title">
                    <span className="result-icon">🔄</span> 조율 제안
                  </h3>
                  <ul className="result-list">
                    {result.adjustments.map((adj, i) => (
                      <li key={i} className="result-item result-item-adjust">
                        {adj.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 📊 2명 빠지는 차선책 */}
              {result.twoMissing.length > 0 && result.allAvailableGroups.length === 0 && (
                <div className="result-card result-two-missing">
                  <h3 className="result-card-title">
                    <span className="result-icon">📊</span> 차선책 (2명 조율 필요)
                  </h3>
                  <ul className="result-list">
                    {result.twoMissing.slice(0, 8).map((item, i) => {
                      const { day, hour } = parseSlot(item.slot)
                      const dayLabel = DAYS.find(d => d.key === day)?.label
                      return (
                        <li key={i} className="result-item">
                          <span className="result-time">
                            {dayLabel}요일 {formatHour(hour)}
                          </span>
                          <span className="result-detail">
                            {item.count}/{item.total}명 가능
                            <span className="missing-name">({item.missing.join(', ')}님 불가)</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 히트맵 탭 */}
      {activeTab === 'heatmap' && (
        <div className="heatmap-section">
          <div className="heatmap-legend">
            <span className="legend-label">적음</span>
            <div className="legend-gradient" />
            <span className="legend-label">전원</span>
          </div>
          <div className="heatmap-container">
            <table className="heatmap-grid">
              <thead>
                <tr>
                  <th></th>
                  {DAYS.map(({ key, label }) => (
                    <th key={key} className="heatmap-day">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map(hour => (
                  <tr key={hour}>
                    <td className="heatmap-hour">{formatHourShort(hour)}</td>
                    {DAYS.map(({ key }) => {
                      const slot = makeSlot(key, hour)
                      const info = result.slotAvailability[slot]
                      const count = info ? info.available.length : 0
                      return (
                        <td
                          key={slot}
                          className={`heatmap-cell ${count === result.totalMembers && count > 0 ? 'heatmap-full' : ''}`}
                          style={{ backgroundColor: getHeatmapColor(count) }}
                          title={`${count}/${result.totalMembers}명 가능${info && info.unavailable.length > 0 ? ` (불가: ${info.unavailable.join(', ')})` : ''}`}
                        >
                          {count > 0 ? count : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="results-footer">
        <button className="btn btn-outline" onClick={onBack}>
          ← 돌아가기
        </button>
        <button
          className={`btn btn-gold ${copied ? 'btn-saved' : ''}`}
          onClick={handleCopy}
        >
          {copied ? '✓ 복사 완료!' : '📋 결과 복사하기'}
        </button>
      </div>
    </div>
  )
}
