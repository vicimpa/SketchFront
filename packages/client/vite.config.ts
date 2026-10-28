import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 5173,
	},
	build: {
		target: 'es2022',
		// public/assets holds the game models, keep the hashed bundle out of it
		assetsDir: 'bundle',
		chunkSizeWarningLimit: 2000,
	},
});
