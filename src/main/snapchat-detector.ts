/**
 * Snapchat Media Type Detector
 * 
 * Detects and classifies Snapchat media types (Snaps, Stories, Spotlights, Chat)
 * from network requests and URLs. Extracts friend usernames and differentiates
 * between friend stories and discover content.
 */

export type SnapchatMediaType = 'snap' | 'story' | 'spotlight' | 'chat' | 'unknown';

export type SnapchatMediaInfo = {
  type: SnapchatMediaType;
  friendUsername?: string;
  isFriendStory: boolean;
  isDiscover: boolean;
  isEphemeral: boolean;
  timestamp?: string;
};

/**
 * Snapchat API endpoint patterns for media detection
 */
const SNAPCHAT_PATTERNS = {
  // Snap (direct message) patterns
  SNAP: [
    /\/bq\/snapchat\.\/v1\/snap\/download/i,
    /\/bq\/snapchat\.\/v1\/media\/snap/i,
    /\/story\/snap\/download/i,
    /\/ph\/snap\/download/i,
  ],
  
  // Story patterns
  STORY: [
    /\/bq\/snapchat\.\/v1\/story\/download/i,
    /\/bq\/snapchat\.\/v1\/media\/story/i,
    /\/story\/download/i,
    /\/story\/chunk/i,
  ],
  
  // Spotlight patterns
  SPOTLIGHT: [
    /\/bq\/snapchat\.\/v1\/spotlight\/download/i,
    /\/bq\/snapchat\.\/v1\/media\/spotlight/i,
    /\/discover\/spotlight/i,
    /\/spotlight\/download/i,
  ],
  
  // Chat patterns
  CHAT: [
    /\/bq\/snapchat\.\/v1\/chat\/media/i,
    /\/bq\/snapchat\.\/v1\/message\/media/i,
    /\/chat\/media\/download/i,
  ],
  
  // Common Snapchat CDN patterns
  CDN: [
    /sc-snapchat\.com/i,
    /snap-ads\.com/i,
    /snapchat\.com\/media/i,
    /sc-cdn\.net/i,
    /sc-jpl\.com/i,
    /sc-static\.net/i,
  ],
};

/**
 * Extract friend username from Snapchat URL
 */
function extractFriendUsername(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Try to extract username from path patterns
    // Common patterns: /username/story, /add/username, /username/add
    const usernameMatch = pathname.match(/\/(?:add|story|profile)?\/?([a-zA-Z0-9._-]{3,20})/i);
    if (usernameMatch && usernameMatch[1]) {
      return usernameMatch[1];
    }
    
    // Try to extract from query parameters
    const usernameParam = urlObj.searchParams.get('username') || 
                         urlObj.searchParams.get('user') ||
                         urlObj.searchParams.get('friend');
    if (usernameParam) {
      return usernameParam;
    }
    
    // Try to extract from request ID patterns (Snapchat uses encoded user IDs)
    const idMatch = pathname.match(/\/([a-f0-9]{8,})/i);
    if (idMatch) {
      // This is likely an encoded user ID, not a username
      // We'll return it as-is for now
      return idMatch[1];
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if URL is from Snapchat
 */
function isSnapchatUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return hostname.includes('snapchat.com') || 
           hostname.includes('sc-snapchat.com') ||
           hostname.includes('snap-ads.com') ||
           hostname.includes('sc-cdn.net') ||
           hostname.includes('sc-jpl.com') ||
           hostname.includes('sc-static.net');
  } catch {
    return false;
  }
}

/**
 * Determine if content is ephemeral (self-destructing)
 * Most Snapchat content is ephemeral by default
 */
function isEphemeralContent(url: string, mimeType: string): boolean {
  // All Snapchat media is considered ephemeral unless it's explicitly marked as saved
  // This is a conservative approach - we treat everything as ephemeral to ensure capture
  return isSnapchatUrl(url);
}

/**
 * Determine if content is from Discover (vs friend content)
 */
function isDiscoverContent(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('discover') || 
         lowerUrl.includes('spotlight') ||
         lowerUrl.includes('explore');
}

/**
 * Detect Snapchat media type from URL and MIME type
 */
export function detectSnapchatMedia(url: string, mimeType: string): SnapchatMediaInfo {
  const lowerUrl = url.toLowerCase();
  
  // Check if this is even a Snapchat URL
  if (!isSnapchatUrl(url)) {
    return {
      type: 'unknown',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: false,
    };
  }
  
  // Detect media type based on URL patterns
  let detectedType: SnapchatMediaType = 'unknown';
  
  // Check in order of specificity (most specific first)
  for (const pattern of SNAPCHAT_PATTERNS.SPOTLIGHT) {
    if (pattern.test(lowerUrl)) {
      detectedType = 'spotlight';
      break;
    }
  }
  
  if (detectedType === 'unknown') {
    for (const pattern of SNAPCHAT_PATTERNS.CHAT) {
      if (pattern.test(lowerUrl)) {
        detectedType = 'chat';
        break;
      }
    }
  }
  
  if (detectedType === 'unknown') {
    for (const pattern of SNAPCHAT_PATTERNS.STORY) {
      if (pattern.test(lowerUrl)) {
        detectedType = 'story';
        break;
      }
    }
  }
  
  if (detectedType === 'unknown') {
    for (const pattern of SNAPCHAT_PATTERNS.SNAP) {
      if (pattern.test(lowerUrl)) {
        detectedType = 'snap';
        break;
      }
    }
  }
  
  // Fallback: infer from MIME type and URL structure
  if (detectedType === 'unknown') {
    if (lowerUrl.includes('story') && !lowerUrl.includes('spotlight')) {
      detectedType = 'story';
    } else if (lowerUrl.includes('chat') || lowerUrl.includes('message')) {
      detectedType = 'chat';
    } else if (lowerUrl.includes('spotlight') || lowerUrl.includes('discover')) {
      detectedType = 'spotlight';
    } else if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      // Default to snap for generic media
      detectedType = 'snap';
    }
  }
  
  // Extract friend username
  const friendUsername = extractFriendUsername(url);
  
  // Determine if this is a friend story vs discover content
  const isDiscover = isDiscoverContent(url);
  const isFriendStory = detectedType === 'story' && !isDiscover && !!friendUsername;
  
  // Determine if ephemeral
  const isEphemeral = isEphemeralContent(url, mimeType);
  
  return {
    type: detectedType,
    friendUsername,
    isFriendStory,
    isDiscover,
    isEphemeral,
  };
}

/**
 * Check if a URL should trigger auto-activation
 */
export function shouldAutoActivate(url: string): boolean {
  return isSnapchatUrl(url);
}

/**
 * Get priority level for media capture
 * Higher priority = should be captured immediately
 */
export function getCapturePriority(mediaInfo: SnapchatMediaInfo): number {
  // Priority levels:
  // 10: Ephemeral snaps (highest priority - self-destructing)
  // 8: Chat media
  // 6: Friend stories
  // 4: Spotlights
  // 2: Discover content
  // 0: Unknown
  
  if (mediaInfo.isEphemeral && mediaInfo.type === 'snap') {
    return 10;
  }
  
  if (mediaInfo.type === 'chat') {
    return 8;
  }
  
  if (mediaInfo.isFriendStory) {
    return 6;
  }
  
  if (mediaInfo.type === 'spotlight') {
    return 4;
  }
  
  if (mediaInfo.isDiscover) {
    return 2;
  }
  
  return 0;
}

/**
 * Generate a safe filename for Snapchat media
 */
export function generateSnapchatFilename(mediaInfo: SnapchatMediaInfo, timestamp: string): string {
  const prefix = mediaInfo.type.toUpperCase();
  const friend = mediaInfo.friendUsername || 'unknown';
  const safeFriend = friend.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  
  return `${prefix}_${safeFriend}_${safeTimestamp}`;
}
