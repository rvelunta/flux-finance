import type { CapacitorConfig } from '@capacitor/cli';

// appId is a placeholder until we publish — freely changeable for now.
const config: CapacitorConfig = {
  appId: 'com.rolandvelunta.flux',
  appName: 'FLUX',
  webDir: 'dist-mobile', // mobile-target Vite build (npm run build:mobile → ../dist-mobile)
};

export default config;
