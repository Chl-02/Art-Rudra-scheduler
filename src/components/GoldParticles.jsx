import { useEffect, useRef } from 'react'

// 배경 금빛 파티클 효과 컴포넌트
// canvas를 사용하여 떠다니는 금빛 입자 애니메이션 구현
export default function GoldParticles() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId

    // 캔버스 크기를 윈도우에 맞춤
    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // 파티클 초기화 (50개)
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2.5 + 0.5,
      speedY: -(Math.random() * 0.3 + 0.1),
      speedX: (Math.random() - 0.5) * 0.2,
      opacity: Math.random() * 0.4 + 0.1,
      pulse: Math.random() * Math.PI * 2 // 깜빡임 위상
    }))

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach(p => {
        // 위치 업데이트
        p.x += p.speedX
        p.y += p.speedY
        p.pulse += 0.02

        // 투명도 깜빡임 효과
        const flickerOpacity = p.opacity + Math.sin(p.pulse) * 0.15
        const finalOpacity = Math.max(0.03, Math.min(0.55, flickerOpacity))

        // 화면 밖으로 나가면 아래에서 다시 시작
        if (p.y < -10) {
          p.y = canvas.height + 10
          p.x = Math.random() * canvas.width
        }
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10

        // 금빛 원 그리기
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201, 168, 76, ${finalOpacity})`
        ctx.fill()

        // 큰 파티클은 글로우 효과 추가
        if (p.size > 1.5) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(240, 208, 96, ${finalOpacity * 0.15})`
          ctx.fill()
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    // 클린업
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="particles-canvas"
      aria-hidden="true"
    />
  )
}
