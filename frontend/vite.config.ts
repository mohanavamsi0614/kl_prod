import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
	return {
		plugins: [react()],
		base: '/',   // serve app at root
		envDir: '../',
		server: {
			proxy: {
				'/auth': {
					target: env.VITE_API_URL,
					changeOrigin: true,
				},

				'/api': {
					target: env.VITE_API_URL,
					changeOrigin: true,
				},
				'/socket.io': {
					target: env.VITE_API_URL,
					ws: true,
					changeOrigin: true,
				},
			},
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true,
		},
		resolve: {
			alias: {
				'@': path.resolve(__dirname, 'src'),
			},
		},
	}
})

