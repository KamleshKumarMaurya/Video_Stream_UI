import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.storixa.app',
  appName: 'Storixa',
  webDir: 'www',
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
  },
  server: {
  allowNavigation: ['gummiest-tamisha-nonmutably.ngrok-free.dev']
}
};

export default config;
