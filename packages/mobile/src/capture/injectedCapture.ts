/**
 * JavaScript injected into the WebView to intercept network requests.
 * This script hooks into fetch, XMLHttpRequest, and HTML media elements
 * to detect when media/segment URLs are being loaded, then posts a message
 * back to the React Native layer via window.ReactNativeWebView.postMessage.
 *
 * IMPORTANT: This runs inside the WebView's JavaScript context.
 * It must be a self-contained string — no imports or closures from outside.
 */

export const INJECTED_CAPTURE_SCRIPT = `
(function() {
  'use strict';

  // Avoid re-injecting if already present
  if (window.__TAN_INJECTED__) return;
  window.__TAN_INJECTED__ = true;

  const MEDIA_MIME_PREFIXES = ['video/', 'audio/', 'image/'];
  const SEGMENT_EXTENSIONS  = /\\.(ts|m4s|fmp4|aac|mp4|m4v|m4a)([?#]|$)/i;
  const MEDIA_EXTENSIONS    = /\\.(mp4|webm|mov|avi|mkv|flv|m3u8|mpd|ogg|opus)([?#]|$)/i;
  const IMAGE_EXTENSIONS    = /\\.(jpg|jpeg|png|webp|avif|gif|svg)([?#]|$)/i;
  const MIN_BYTES           = 512;

  function isInteresting(url, contentType, byteLength) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
    if (byteLength !== undefined && byteLength < MIN_BYTES) return false;
    const ct = (contentType || '').split(';')[0].trim().toLowerCase();
    if (MEDIA_MIME_PREFIXES.some(p => ct.startsWith(p))) return true;
    if (ct.includes('mpegurl') || ct.includes('m3u8') || ct.includes('dash')) return true;
    if (ct === 'application/octet-stream') {
      return SEGMENT_EXTENSIONS.test(url) || MEDIA_EXTENSIONS.test(url);
    }
    return SEGMENT_EXTENSIONS.test(url) || MEDIA_EXTENSIONS.test(url) || IMAGE_EXTENSIONS.test(url);
  }

  function postCapture(url, contentType, byteLength) {
    if (!isInteresting(url, contentType, byteLength)) return;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:        'capture',
        url,
        contentType: contentType || '',
        byteLength:  byteLength || 0,
        timestamp:   new Date().toISOString(),
      }));
    } catch (e) {}
  }

  // ── Intercept fetch ────────────────────────────────────────────────
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    const response = await origFetch(input, init);
    const ct  = response.headers.get('content-type') || '';
    const len = parseInt(response.headers.get('content-length') || '0', 10);
    if (isInteresting(url, ct, len)) {
      if (len > 0) {
        // content-length already known — no need to buffer the response body
        postCapture(url, ct, len);
      } else {
        // No content-length: clone the response to measure the actual body size
        response.clone().arrayBuffer().then(buf => {
          postCapture(url, ct, buf.byteLength);
        }).catch(() => postCapture(url, ct, 0));
      }
    }
    return response;
  };

  // ── Intercept XMLHttpRequest ────────────────────────────────────────
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OrigXHR();
    let _url = '';
    const origOpen  = xhr.open.bind(xhr);
    const origSend  = xhr.send.bind(xhr);
    xhr.open = function(method, url, ...rest) {
      _url = String(url);
      return origOpen(method, url, ...rest);
    };
    xhr.send = function(body) {
      xhr.addEventListener('readystatechange', function() {
        if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
          const ct  = xhr.getResponseHeader('content-type') || '';
          const len = xhr.response instanceof ArrayBuffer
            ? xhr.response.byteLength
            : (xhr.responseText ? xhr.responseText.length : 0);
          postCapture(_url, ct, len);
        }
      });
      return origSend(body);
    };
    // Copy static properties
    for (const k in OrigXHR) { try { xhr[k] = OrigXHR[k]; } catch(e) {} }
    return xhr;
  };
  Object.setPrototypeOf(window.XMLHttpRequest, OrigXHR);
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  // ── Observe media element src changes ──────────────────────────────
  const mediaObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
          const src = node.src || node.currentSrc;
          if (src) postCapture(src, node.nodeName === 'VIDEO' ? 'video/mp4' : 'audio/mpeg', 0);
        }
        if (node.nodeName === 'SOURCE') {
          const src  = node.src;
          const type = node.type;
          if (src) postCapture(src, type, 0);
        }
      }
    }
  });
  mediaObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Disconnect when the page hides (SPA soft-nav or WebView recycle) to stop
  // accumulating DOM observations against a stale document context.
  window.addEventListener('pagehide', function() { mediaObserver.disconnect(); }, { once: true });

  // Also capture any media already in the DOM at injection time
  document.querySelectorAll('video,audio').forEach(el => {
    if (el.src) postCapture(el.src, el.nodeName === 'VIDEO' ? 'video/mp4' : 'audio/mpeg', 0);
    el.querySelectorAll('source').forEach(s => {
      if (s.src) postCapture(s.src, s.type, 0);
    });
  });

  true; // required for injectedJavaScript return value
})();
`;
