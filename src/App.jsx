import { useState, useEffect } from 'react'
import { db, isFirebaseConfigured } from './firebase'
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore'
import GoldParticles from './components/GoldParticles'
import MemberSelect from './components/MemberSelect'
import TimeInput from './components/TimeInput'
import Results from './components/Results'
import Settings from './components/Settings'

// 초기 멤버 데이터 (예시)
const DEFAULT_MEMBERS = [
  { name: '킹시', class: '호법성' },
  { name: '은호', class: '치유성' },
  { name: '아르테', class: '궁성' },
  { name: '세이라', class: '마도성' },
  { name: '가디언', class: '수호성' },
  { name: '레인', class: '궁성' },
  { name: '미르', class: '치유성' },
  { name: '제논', class: '호법성' }
]

// 기본 설정값
const DEFAULT_CONFIG = {
  members: DEFAULT_MEMBERS,
  timeRange: { start: 20, end: 25 } // 오후 8시 ~ 오전 1시
}

// 메인 앱 컴포넌트
// 화면 전환과 Firebase 데이터 구독을 관리
export default function App() {
  // 현재 화면: 'select' | 'input' | 'results' | 'settings'
  const [screen, setScreen] = useState('select')
  // 선택된 멤버
  const [selectedMember, setSelectedMember] = useState(null)
  // Firestore에서 가져온 설정
  const [config, setConfig] = useState(null)
  // Firestore에서 가져온 스케줄 데이터
  const [schedules, setSchedules] = useState({})
  // Firebase 설정 여부
  const [firebaseReady, setFirebaseReady] = useState(false)
  // 초기 로딩 상태
  const [loading, setLoading] = useState(true)

  // Firebase 실시간 구독
  useEffect(() => {
    // Firebase 미설정 시 기본 데이터로 작동
    if (!isFirebaseConfigured()) {
      setConfig(DEFAULT_CONFIG)
      setLoading(false)
      return
    }

    setFirebaseReady(true)

    // 설정 문서 구독
    const unsubConfig = onSnapshot(
      doc(db, 'config', 'settings'),
      async (snap) => {
        if (snap.exists()) {
          setConfig(snap.data())
        } else {
          // 첫 실행: 기본 설정 저장
          try {
            await setDoc(doc(db, 'config', 'settings'), DEFAULT_CONFIG)
            setConfig(DEFAULT_CONFIG)
          } catch (e) {
            console.error('기본 설정 저장 실패:', e)
            setConfig(DEFAULT_CONFIG)
          }
        }
        setLoading(false)
      },
      (error) => {
        console.error('설정 구독 오류:', error)
        setConfig(DEFAULT_CONFIG)
        setLoading(false)
      }
    )

    // 스케줄 문서 구독
    const unsubSchedules = onSnapshot(
      doc(db, 'schedules', 'current'),
      (snap) => {
        if (snap.exists()) {
          setSchedules(snap.data())
        } else {
          setSchedules({})
        }
      },
      (error) => {
        console.error('스케줄 구독 오류:', error)
      }
    )

    return () => {
      unsubConfig()
      unsubSchedules()
    }
  }, [])

  // 화면 전환 핸들러
  const handleSelectMember = (member) => {
    setSelectedMember(member)
    setScreen('input')
  }

  const handleBack = () => {
    setScreen('select')
    setSelectedMember(null)
  }

  const handleViewResults = () => setScreen('results')
  const handleSettings = () => setScreen('settings')

  // 로딩 화면
  if (loading) {
    return (
      <div className="app">
        <GoldParticles />
        <div className="loading-container">
          <div className="loading-emblem">⚔️</div>
          <div className="loading-spinner" />
          <p className="loading-text">로딩중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* 배경 파티클 효과 */}
      <GoldParticles />

      {/* 상단 네비게이션 */}
      <header className="app-header">
        <div className="header-left">
          {screen !== 'select' && (
            <button className="btn btn-ghost" onClick={handleBack}>
              ← 돌아가기
            </button>
          )}
        </div>
        <div className="header-center" onClick={handleBack} style={{ cursor: 'pointer' }}>
          <h1 className="app-title">
            <span className="title-icon">⚔️</span>
            아티 성역 스케줄러
          </h1>
        </div>
        <div className="header-right">
          {screen !== 'results' && (
            <button className="btn btn-ghost" onClick={handleViewResults} title="결과 보기">
              📊
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleSettings} title="설정">
            ⚙️
          </button>
        </div>
      </header>

      {/* Firebase 미설정 경고 */}
      {!firebaseReady && (
        <div className="firebase-warning">
          ⚠️ Firebase가 설정되지 않았습니다.
          <code>src/firebase.js</code> 파일에서 Firebase 설정값을 입력해주세요.
          현재 오프라인 데모 모드로 실행 중입니다 (데이터가 저장되지 않습니다).
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <main className="app-content">
        {screen === 'select' && (
          <MemberSelect
            config={config}
            schedules={schedules}
            onSelect={handleSelectMember}
            onViewResults={handleViewResults}
          />
        )}
        {screen === 'input' && (
          <TimeInput
            member={selectedMember}
            config={config}
            schedules={schedules}
            onBack={handleBack}
          />
        )}
        {screen === 'results' && (
          <Results
            config={config}
            schedules={schedules}
            onBack={handleBack}
          />
        )}
        {screen === 'settings' && (
          <Settings
            config={config}
            onBack={handleBack}
          />
        )}
      </main>

      {/* 하단 푸터 */}
      <footer className="app-footer">
        <p>아티 성역 원정대 스케줄러 · 아이온2</p>
      </footer>
    </div>
  )
}
