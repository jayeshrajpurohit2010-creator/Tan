import { describe, expect, it } from 'vitest';
import {
  parseHLSManifest,
  calculateTotalDuration,
  getBestVariant,
  isPlaylistEncrypted,
  getEncryptionKeyUrls,
} from '../src/main/hls-parser';
import type {
  HLSMediaPlaylist,
  HLSMasterPlaylist,
} from '../src/main/hls-parser';

const BASE_URL = 'https://cdn.example.com/streams/123/master.m3u8';

describe('HLS manifest parser', () => {
  describe('parseHLSManifest', () => {
    it('parses a master playlist with multiple variants', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=1280000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=720x480',
        'low/low.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=2560000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1280x720',
        'mid/mid.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=7680000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080',
        'hi/hi.m3u8',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL);
      expect(result.type).toBe('master');

      const master = result as HLSMasterPlaylist;
      expect(master.variants).toHaveLength(3);

      expect(master.variants[0].bandwidth).toBe(1280000);
      expect(master.variants[0].resolution).toBe('720x480');
      expect(master.variants[0].url).toBe('https://cdn.example.com/streams/123/low/low.m3u8');

      expect(master.variants[1].bandwidth).toBe(2560000);
      expect(master.variants[1].url).toBe('https://cdn.example.com/streams/123/mid/mid.m3u8');

      expect(master.variants[2].bandwidth).toBe(7680000);
      expect(master.variants[2].url).toBe('https://cdn.example.com/streams/123/hi/hi.m3u8');
    });

    it('parses a media playlist with segments', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXTINF:9.009,',
        'http://media.example.com/first.ts',
        '#EXTINF:9.009,',
        'http://media.example.com/second.ts',
        '#EXTINF:3.003,',
        'http://media.example.com/third.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL);
      expect(result.type).toBe('media');

      const media = result as HLSMediaPlaylist;
      expect(media.segments).toHaveLength(3);
      expect(media.targetDuration).toBe(10);
      expect(media.endList).toBe(true);
      expect(media.isLive).toBe(false);

      expect(media.segments[0].url).toBe('http://media.example.com/first.ts');
      expect(media.segments[0].duration).toBeCloseTo(9.009);
      expect(media.segments[1].url).toBe('http://media.example.com/second.ts');
      expect(media.segments[2].duration).toBeCloseTo(3.003);
    });

    it('parses an encrypted HLS playlist with EXT-X-KEY', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
        '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key1.bin",IV=0x00000000000000000000000000000001',
        '#EXTINF:9.009,',
        'http://media.example.com/first.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].isEncrypted).toBe(true);
      expect(result.segments[0].encryptionKeyUrl).toBe('https://keys.example.com/key1.bin');
      expect(result.segments[0].encryptionIV).toBe('00000000000000000000000000000001');
    });

    it('parses a live playlist without EXT-X-ENDLIST', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
        '#EXT-X-PLAYLIST-TYPE:EVENT',
        '#EXTINF:9.009,',
        'http://media.example.com/first.ts',
        '#EXTINF:9.009,',
        'http://media.example.com/second.ts',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.isLive).toBe(true);
      expect(result.endList).toBe(false);
    });

    it('parses an ended playlist with EXT-X-ENDLIST', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
        '#EXTINF:9.009,',
        'http://media.example.com/first.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.endList).toBe(true);
      expect(result.isLive).toBe(false);
    });

    it('parses segment durations correctly', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXTINF:6.000,',
        'seg0.ts',
        '#EXTINF:4.500,',
        'seg1.ts',
        '#EXTINF:0.333,',
        'seg2.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.segments[0].duration).toBeCloseTo(6.0);
      expect(result.segments[1].duration).toBeCloseTo(4.5);
      expect(result.segments[2].duration).toBeCloseTo(0.333);
    });

    it('assigns sequential sequence numbers to segments', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:10',
        '#EXTINF:5.0,',
        'a.ts',
        '#EXTINF:5.0,',
        'b.ts',
        '#EXTINF:5.0,',
        'c.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.segments[0].sequenceNumber).toBe(0);
      expect(result.segments[1].sequenceNumber).toBe(1);
      expect(result.segments[2].sequenceNumber).toBe(2);
    });

    it('handles discontinuity tags', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:10',
        '#EXTINF:5.0,',
        '#EXT-X-DISCONTINUITY',
        'a.ts',
        '#EXTINF:5.0,',
        'b.ts',
        '#EXTINF:5.0,',
        '#EXT-X-DISCONTINUITY',
        'c.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.segments[0].discontinuity).toBe(true);
      expect(result.segments[1].discontinuity).toBe(false);
      expect(result.segments[2].discontinuity).toBe(true);
    });

    it('resolves relative URLs against the base URL', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:10',
        '#EXTINF:5.0,',
        'segment001.ts',
        '#EXTINF:5.0,',
        './segment002.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, 'https://cdn.example.com/path/to/playlist.m3u8') as HLSMediaPlaylist;
      expect(result.segments[0].url).toBe('https://cdn.example.com/path/to/segment001.ts');
      expect(result.segments[1].url).toBe('https://cdn.example.com/path/to/segment002.ts');
    });

    it('keeps absolute URLs unchanged', () => {
      const manifest = [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:10',
        '#EXTINF:5.0,',
        'https://cdn.other.com/seg.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const result = parseHLSManifest(manifest, BASE_URL) as HLSMediaPlaylist;
      expect(result.segments[0].url).toBe('https://cdn.other.com/seg.ts');
    });

    it('throws on an empty manifest', () => {
      expect(() => parseHLSManifest('', BASE_URL)).toThrow('Empty HLS manifest');
    });

    it('throws when the #EXTM3U tag is missing', () => {
      const badManifest = [
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
      ].join('\n');

      expect(() => parseHLSManifest(badManifest, BASE_URL)).toThrow('missing #EXTM3U tag');
    });
  });

  describe('calculateTotalDuration', () => {
    it('sums all segment durations', () => {
      const playlist: HLSMediaPlaylist = {
        type: 'media',
        targetDuration: 10,
        isLive: false,
        endList: true,
        segments: [
          { url: 'a.ts', duration: 9.009, isEncrypted: false, discontinuity: false },
          { url: 'b.ts', duration: 9.009, isEncrypted: false, discontinuity: false },
          { url: 'c.ts', duration: 3.003, isEncrypted: false, discontinuity: false },
        ],
      };

      expect(calculateTotalDuration(playlist)).toBeCloseTo(21.021);
    });

    it('returns 0 for an empty playlist', () => {
      const playlist: HLSMediaPlaylist = {
        type: 'media',
        targetDuration: 10,
        isLive: false,
        endList: true,
        segments: [],
      };

      expect(calculateTotalDuration(playlist)).toBe(0);
    });
  });

  describe('getBestVariant', () => {
    const master: HLSMasterPlaylist = {
      type: 'master',
      variants: [
        { bandwidth: 1000000, url: 'low.m3u8', resolution: '640x360' },
        { bandwidth: 3000000, url: 'mid.m3u8', resolution: '1280x720' },
        { bandwidth: 6000000, url: 'high.m3u8', resolution: '1920x1080' },
      ],
    };

    it('selects the highest bandwidth variant when no max is specified', () => {
      const best = getBestVariant(master);
      expect(best).not.toBeNull();
      expect(best!.bandwidth).toBe(6000000);
      expect(best!.url).toBe('high.m3u8');
    });

    it('selects the highest variant under the max bandwidth', () => {
      const best = getBestVariant(master, 4000000);
      expect(best).not.toBeNull();
      expect(best!.bandwidth).toBe(3000000);
    });

    it('returns the lowest variant when all exceed max bandwidth', () => {
      const best = getBestVariant(master, 500000);
      expect(best).not.toBeNull();
      expect(best!.bandwidth).toBe(1000000);
    });

    it('returns null for an empty master playlist', () => {
      const empty: HLSMasterPlaylist = { type: 'master', variants: [] };
      expect(getBestVariant(empty)).toBeNull();
    });
  });

  describe('isPlaylistEncrypted', () => {
    it('returns true when at least one segment is encrypted', () => {
      const playlist: HLSMediaPlaylist = {
        type: 'media',
        targetDuration: 10,
        isLive: false,
        endList: true,
        segments: [
          { url: 'a.ts', duration: 5, isEncrypted: false, discontinuity: false },
          { url: 'b.ts', duration: 5, isEncrypted: true, encryptionKeyUrl: 'key.bin', discontinuity: false },
        ],
      };

      expect(isPlaylistEncrypted(playlist)).toBe(true);
    });

    it('returns false when no segments are encrypted', () => {
      const playlist: HLSMediaPlaylist = {
        type: 'media',
        targetDuration: 10,
        isLive: false,
        endList: true,
        segments: [
          { url: 'a.ts', duration: 5, isEncrypted: false, discontinuity: false },
          { url: 'b.ts', duration: 5, isEncrypted: false, discontinuity: false },
        ],
      };

      expect(isPlaylistEncrypted(playlist)).toBe(false);
    });
  });

  describe('getEncryptionKeyUrls', () => {
    it('returns unique encryption key URLs', () => {
      const playlist: HLSMediaPlaylist = {
        type: 'media',
        targetDuration: 10,
        isLive: false,
        endList: true,
        segments: [
          { url: 'a.ts', duration: 5, isEncrypted: true, encryptionKeyUrl: 'https://keys.example.com/key1.bin', discontinuity: false },
          { url: 'b.ts', duration: 5, isEncrypted: true, encryptionKeyUrl: 'https://keys.example.com/key1.bin', discontinuity: false },
          { url: 'c.ts', duration: 5, isEncrypted: true, encryptionKeyUrl: 'https://keys.example.com/key2.bin', discontinuity: false },
        ],
      };

      const urls = getEncryptionKeyUrls(playlist);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://keys.example.com/key1.bin');
      expect(urls).toContain('https://keys.example.com/key2.bin');
    });

    it('returns an empty array for unencrypted playlists', () => {
      const playlist: HLSMediaPlaylist = {
        type: 'media',
        targetDuration: 10,
        isLive: false,
        endList: true,
        segments: [
          { url: 'a.ts', duration: 5, isEncrypted: false, discontinuity: false },
        ],
      };

      expect(getEncryptionKeyUrls(playlist)).toEqual([]);
    });
  });
});
