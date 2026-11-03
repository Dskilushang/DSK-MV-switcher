import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dskilushang.obsswitcher',
  appName: 'DSK R8 Switcher',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
