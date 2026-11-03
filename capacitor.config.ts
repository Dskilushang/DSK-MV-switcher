import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dskilushang.r8studio',
  appName: 'DSK-R8 Studio',
  webDir: 'dist',
  server: { androidScheme: 'http', cleartext: true },
};
export default config;
