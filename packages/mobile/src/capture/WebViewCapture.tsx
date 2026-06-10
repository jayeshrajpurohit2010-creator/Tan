import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { INJECTED_CAPTURE_SCRIPT } from './injectedCapture';
import type { CaptureManager } from './CaptureManager';
import { Colors } from '../theme';

export interface WebViewCaptureHandle {
  loadUrl(url: string): void;
  reload(): void;
  goBack(): void;
  goForward(): void;
}

interface WebViewCaptureProps {
  url:            string;
  captureManager: CaptureManager;
  onNavigate?:    (url: string) => void;
  style?:         object;
}

/**
 * Embedded browser with capture injection.
 * The INJECTED_CAPTURE_SCRIPT hooks fetch/XHR/media elements and posts
 * capture messages back to this component, which routes them to CaptureManager.
 */
const WebViewCapture = forwardRef<WebViewCaptureHandle, WebViewCaptureProps>(
  function WebViewCapture({ url, captureManager, onNavigate, style }, ref) {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      loadUrl: (nextUrl) => webViewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(nextUrl)}; true;`
      ),
      reload:     () => webViewRef.current?.reload(),
      goBack:     () => webViewRef.current?.goBack(),
      goForward:  () => webViewRef.current?.goForward(),
    }));

    const handleMessage = (event: WebViewMessageEvent): void => {
      void captureManager.handleWebViewMessage(event.nativeEvent.data);
    };

    const handleNavigation = (event: WebViewNavigation): void => {
      onNavigate?.(event.url);
    };

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webView}
          // Re-inject the script after every page navigation
          injectedJavaScript={INJECTED_CAPTURE_SCRIPT}
          injectedJavaScriptBeforeContentLoaded={INJECTED_CAPTURE_SCRIPT}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigation}
          // Allow mixed content for maximum media capture
          mixedContentMode="always"
          // Disable data saver so full media loads
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          domStorageEnabled
          javaScriptEnabled
          // Spoof a real Android Chrome UA to avoid bot detection
          userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        />
      </View>
    );
  }
);

export default WebViewCapture;

const styles = StyleSheet.create({
  container: {
    flex:            1,
    borderWidth:     1,
    borderColor:     `${Colors.purple}44`,
    overflow:        'hidden',
    backgroundColor: Colors.background,
  },
  webView: {
    flex:            1,
    backgroundColor: Colors.background,
  },
});
