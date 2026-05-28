import type { CapacitorConfig } from '@capacitor/cli';

// appId is a placeholder until we publish — freely changeable for now.
const config: CapacitorConfig = {
  appId: 'com.rolandvelunta.flux',
  appName: 'FLUX',
  webDir: 'dist', // Vite build output (vite.config.js: build.outDir = ../dist)
};

export default config;
