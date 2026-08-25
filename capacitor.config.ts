import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dokkit.app',
  appName: 'Dokkit',
  webDir: 'public',
  server: {
    url: 'https://dokkit.space/app',
    cleartext: false
  }
};

export default config;
