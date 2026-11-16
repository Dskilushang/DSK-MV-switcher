import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dskmv.app',
  appName: 'DSK-MV-switcher',
  webDir: 'dist',
  orientation: 'landscape', // Force l'écran à l'horizontale
  server: {
    androidScheme: 'https'
  }
};

export default config;
