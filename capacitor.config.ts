import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.videostreaming',
  appName: 'Video Streaming',
  webDir: 'www',
  plugins: {
    StatusBar: {
      overlaysWebView: false,
    },
  },
  server: {
  allowNavigation: ['gummiest-tamisha-nonmutably.ngrok-free.dev']
}
};

export default config;
