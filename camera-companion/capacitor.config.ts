import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dskmv.camera',
  appName: 'DSK Camera',
  webDir: 'dist',
  android: {
    // Provisoire : autorise la signalisation WebSocket sur le LAN.
    // À remplacer par une signalisation sécurisée avant commercialisation.
    allowMixedContent: true
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
