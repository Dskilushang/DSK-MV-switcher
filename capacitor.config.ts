import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dskmv.app',
  appName: 'DSK-MV-switcher',
  webDir: 'dist',
  // Ne pas verrouiller l'orientation : Android suit l'orientation de l'appareil.
  android: {
    // Autorise le WebSocket local vers DSK Audio Receiver sur le réseau privé.
    allowMixedContent: true
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
