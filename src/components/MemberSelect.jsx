import { useState } from 'react'

// 직업별 아이콘 매핑
const CLASS_ICONS = {
  '호법성': '⚔️',
  '치유성': '💚',
  '궁성': '🏹',
  '마도성': '🔮',
  '수호성': '🛡️',
  '암살성': '🗡️',
  '음유성': '🎵',
  '정령성': '🌿'
}

// 메인 화면 — 멤버 선택 카드 컴포넌트
// 8명의 팀원이 카드 형태로 표시되며, 자기 닉네임을 클릭하여 입장
export default function MemberSelect({ config, schedules, onSelect, onViewResults }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  if (!config) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">운명의 기록을 불러오는 중...</p>
      </div>
    )
  }

  const members = config.members || []
  // 등록 완료한 멤버 수 계산
  const submittedCount = members.filter(m => schedules[m.name]).length

  return (
    <div className="member-select">
      <div className="select-title-area">
        <h2 className="select-title">용사를 선택하시오</h2>
        <p className="select-subtitle">
          시간을 각인할 용사의 이름을 선택하세요
        </p>
        <div className="submit-status">
          <span className="submit-count">{submittedCount}</span>
          <span className="submit-total">/{members.length}명 등록 완료</span>
        </div>
      </div>

      <div className="member-grid">
        {members.map((member, idx) => {
          const isSubmitted = !!schedules[member.name]
          const icon = CLASS_ICONS[member.class] || '⚔️'

          return (
            <button
              key={member.name}
              className={`member-card ${isSubmitted ? 'submitted' : ''} ${hoverIdx === idx ? 'hovered' : ''}`}
              onClick={() => onSelect(member)}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* 골드 코너 장식 */}
              <div className="card-corner top-left" />
              <div className="card-corner top-right" />
              <div className="card-corner bottom-left" />
              <div className="card-corner bottom-right" />

              {/* 등록 완료 체크 표시 */}
              {isSubmitted && (
                <div className="submitted-badge" title="시간 등록 완료">✓</div>
              )}

              {/* 직업 아이콘 */}
              <div className="member-icon">{icon}</div>

              {/* 닉네임 */}
              <div className="member-name">{member.name}</div>

              {/* 직업명 */}
              <div className="member-class">{member.class}</div>
            </button>
          )
        })}
      </div>

      {/* 결과 보기 버튼 */}
      <div className="select-actions">
        <button className="btn btn-gold btn-large" onClick={onViewResults}>
          📊 운명의 시간 확인하기
        </button>
      </div>
    </div>
  )
}
