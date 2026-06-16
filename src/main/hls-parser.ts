/**
 * HLS Manifest Parser for Snapchat Streams
 * 
 * Parses .m3u8 playlists (master and media playlists) for Snapchat Stories and Spotlights.
 * Extracts segment URLs, durations, encryption keys, and handles discontinuity tags.
 */

export type HLSSegment = {
  url: string;
  duration: number;
  sequenceNumber?: number;
  isEncrypted: boolean;
  encryptionKeyUrl?: string;
  encryptionIV?: string;
  discontinuity: boolean;
};

export type HLSMediaPlaylist = {
  type: 'media';
  targetDuration: number;
  segments: HLSSegment[];
  isLive: boolean;
  endList: boolean;
};

export type HLSVariant = {
  bandwidth: number;
  resolution?: string;
  codecs?: string;
  url: string;
};

export type HLSMasterPlaylist = {
  type: 'master';
  variants: HLSVariant[];
};

export type HLSPlaylist = HLSMediaPlaylist | HLSMasterPlaylist;

/**
 * Parse an HLS manifest (.m3u8 playlist)
 */
export function parseHLSManifest(content: string, baseUrl: string): HLSPlaylist {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length === 0) {
    throw new Error('Empty HLS manifest');
  }

  // Check if this is a master playlist or media playlist
  const firstLine = lines[0];
  if (!firstLine.startsWith('#EXTM3U')) {
    throw new Error('Invalid HLS manifest: missing #EXTM3U tag');
  }

  // Check for master playlist indicators
  const hasStreamInfo = lines.some(line => line.startsWith('#EXT-X-STREAM-INF'));
  
  if (hasStreamInfo) {
    return parseMasterPlaylist(lines, baseUrl);
  } else {
    return parseMediaPlaylist(lines, baseUrl);
  }
}

/**
 * Parse a master playlist (contains variant streams)
 */
function parseMasterPlaylist(lines: string[], baseUrl: string): HLSMasterPlaylist {
  const variants: HLSVariant[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const streamInfo = parseStreamInfo(line);
      
      // Next line should be the variant URL
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith('#')) {
        variants.push({
          ...streamInfo,
          url: resolveUrl(nextLine, baseUrl),
        });
      }
    }
  }
  
  return {
    type: 'master',
    variants,
  };
}

/**
 * Split a string by commas, respecting quoted strings
 */
function splitByCommaRespectingQuotes(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (inQuotes) {
      current += char;
      if (char === quoteChar) {
        inQuotes = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  if (current) {
    result.push(current);
  }
  
  return result;
}

/**
 * Parse stream info from #EXT-X-STREAM-INF line
 */
function parseStreamInfo(line: string): Omit<HLSVariant, 'url'> {
  const info: Omit<HLSVariant, 'url'> = {
    bandwidth: 0,
  };
  
  const params = splitByCommaRespectingQuotes(line.substring('#EXT-X-STREAM-INF:'.length));
  
  for (const param of params) {
    const [key, value] = param.split('=').map(p => p.trim());
    
    if (key === 'BANDWIDTH') {
      info.bandwidth = parseInt(value, 10);
    } else if (key === 'RESOLUTION') {
      info.resolution = value;
    } else if (key === 'CODECS') {
      info.codecs = value;
    }
  }
  
  return info;
}

/**
 * Parse a media playlist (contains segments)
 */
function parseMediaPlaylist(lines: string[], baseUrl: string): HLSMediaPlaylist {
  const segments: HLSSegment[] = [];
  let targetDuration = 10;
  let isLive = false;
  let endList = false;
  
  let currentSegment: Partial<HLSSegment> = {};
  let sequenceNumber = 0;
  let currentEncryptionState = { isEncrypted: false, encryptionKeyUrl: undefined as string | undefined, encryptionIV: undefined as string | undefined };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
      const type = line.split(':')[1];
      isLive = type === 'EVENT';
    } else if (line.startsWith('#EXT-X-ENDLIST')) {
      endList = true;
    } else if (line.startsWith('#EXTINF:')) {
      const duration = parseFloat(line.split(':')[1].split(',')[0]);
      currentSegment.duration = duration;
      currentSegment.discontinuity = false;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const keyInfo = parseEncryptionKey(line);
      currentEncryptionState = {
        isEncrypted: true,
        encryptionKeyUrl: resolveUrl(keyInfo.url, baseUrl),
        encryptionIV: keyInfo.iv,
      };
    } else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
      currentSegment.discontinuity = true;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      // Skip initialization segments for now
    } else if (!line.startsWith('#')) {
      // This is a segment URL
      if (currentSegment.duration !== undefined) {
        segments.push({
          url: resolveUrl(line, baseUrl),
          duration: currentSegment.duration,
          sequenceNumber: sequenceNumber++,
          isEncrypted: currentEncryptionState.isEncrypted,
          encryptionKeyUrl: currentEncryptionState.encryptionKeyUrl,
          encryptionIV: currentEncryptionState.encryptionIV,
          discontinuity: currentSegment.discontinuity || false,
        });
      }
      currentSegment = {};
    }
  }
  
  return {
    type: 'media',
    targetDuration,
    segments,
    isLive,
    endList,
  };
}

/**
 * Parse encryption key information from #EXT-X-KEY line
 */
function parseEncryptionKey(line: string): { url: string; iv?: string } {
  const info: { url: string; iv?: string } = {
    url: '',
  };
  
  const params = splitByCommaRespectingQuotes(line.substring('#EXT-X-KEY:'.length));
  
  for (const param of params) {
    const [key, value] = param.split('=').map(p => p.trim());
    
    if (key === 'URI') {
      info.url = value.replace(/"/g, '');
    } else if (key === 'IV') {
      info.iv = value.replace(/"/g, '').replace('0x', '');
    }
  }
  
  return info;
}

/**
 * Resolve a relative URL against a base URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(url, base);
    return resolved.toString();
  } catch {
    // If base URL parsing fails, return as-is
    return url;
  }
}

/**
 * Calculate total duration of a media playlist
 */
export function calculateTotalDuration(playlist: HLSMediaPlaylist): number {
  return playlist.segments.reduce((total, segment) => total + segment.duration, 0);
}

/**
 * Get the best variant from a master playlist based on bandwidth
 */
export function getBestVariant(masterPlaylist: HLSMasterPlaylist, maxBandwidth?: number): HLSVariant | null {
  if (masterPlaylist.variants.length === 0) {
    return null;
  }
  
  const sortedVariants = [...masterPlaylist.variants].sort((a, b) => b.bandwidth - a.bandwidth);
  
  if (!maxBandwidth) {
    return sortedVariants[0];
  }
  
  // Find the highest quality variant under the max bandwidth
  for (const variant of sortedVariants) {
    if (variant.bandwidth <= maxBandwidth) {
      return variant;
    }
  }
  
  // If all variants exceed max bandwidth, return the lowest quality
  return sortedVariants[sortedVariants.length - 1];
}

/**
 * Check if a playlist is encrypted
 */
export function isPlaylistEncrypted(playlist: HLSMediaPlaylist): boolean {
  return playlist.segments.some(segment => segment.isEncrypted);
}

/**
 * Get all encryption key URLs from a playlist
 */
export function getEncryptionKeyUrls(playlist: HLSMediaPlaylist): string[] {
  const keyUrls = new Set<string>();
  
  for (const segment of playlist.segments) {
    if (segment.encryptionKeyUrl) {
      keyUrls.add(segment.encryptionKeyUrl);
    }
  }
  
  return Array.from(keyUrls);
}
