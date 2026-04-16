import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const base = process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
})
