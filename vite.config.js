import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 설정 - GitHub Pages 배포를 위한 base 경로 설정
export default defineConfig({
  plugins: [react()],
  base: '/Art-Rudra-scheduler/'
})
