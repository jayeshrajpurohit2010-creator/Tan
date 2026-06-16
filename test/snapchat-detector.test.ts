import { describe, expect, it } from 'vitest';
import {
  detectSnapchatMedia,
  shouldAutoActivate,
  getCapturePriority,
  generateSnapchatFilename,
  SnapchatMediaInfo,
} from '../src/main/snapchat-detector';

describe('detectSnapchatMedia', () => {
  describe('snap detection', () => {
    it('detects snap download URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=123',
        'image/jpeg',
      );
      expect(result.type).toBe('snap');
      expect(result.isEphemeral).toBe(true);
    });

    it('detects media snap URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/media/snap?id=abc',
        'video/mp4',
      );
      expect(result.type).toBe('snap');
    });

    it('detects story/snap/download pattern as snap', () => {
      const result = detectSnapchatMedia(
        'https://snapchat.com/story/snap/download?ref=123',
        'image/png',
      );
      expect(result.type).toBe('snap');
    });

    it('detects ph/snap/download pattern as snap', () => {
      const result = detectSnapchatMedia(
        'https://snapchat.com/ph/snap/download?token=xyz',
        'image/jpeg',
      );
      expect(result.type).toBe('snap');
    });
  });

  describe('story detection', () => {
    it('detects story download URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/story/download?id=456',
        'video/mp4',
      );
      expect(result.type).toBe('story');
    });

    it('detects media story URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/media/story?id=789',
        'image/jpeg',
      );
      expect(result.type).toBe('story');
    });

    it('detects story/chunk pattern', () => {
      const result = detectSnapchatMedia(
        'https://snapchat.com/story/chunk?index=0',
        'video/mp4',
      );
      expect(result.type).toBe('story');
    });

    it('identifies friend story with username from path', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/add/buddy42/story?id=1',
        'video/mp4',
      );
      expect(result.type).toBe('story');
      expect(result.isFriendStory).toBe(true);
      expect(result.friendUsername).toBe('buddy42');
    });

    it('identifies friend story when username extracted from path segment', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/story/download?user=john_doe',
        'video/mp4',
      );
      expect(result.type).toBe('story');
      expect(result.friendUsername).toBeDefined();
      expect(result.isFriendStory).toBe(true);
    });

    it('marks discover story as not friend story', () => {
      const result = detectSnapchatMedia(
        'https://snapchat.com/discover/some-article/12345',
        'video/mp4',
      );
      expect(result.isFriendStory).toBe(false);
      expect(result.isDiscover).toBe(true);
    });
  });

  describe('spotlight detection', () => {
    it('detects spotlight download URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/spotlight/download?id=000',
        'video/mp4',
      );
      expect(result.type).toBe('spotlight');
      expect(result.isDiscover).toBe(true);
    });

    it('detects media spotlight URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/media/spotlight?id=111',
        'image/jpeg',
      );
      expect(result.type).toBe('spotlight');
    });

    it('detects discover/spotlight path pattern', () => {
      const result = detectSnapchatMedia(
        'https://snapchat.com/discover/spotlight?clipId=999',
        'video/mp4',
      );
      expect(result.type).toBe('spotlight');
    });
  });

  describe('chat detection', () => {
    it('detects chat media URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/chat/media?id=222',
        'image/jpeg',
      );
      expect(result.type).toBe('chat');
    });

    it('detects message media URL pattern', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/message/media?id=333',
        'video/mp4',
      );
      expect(result.type).toBe('chat');
    });

    it('detects chat/media/download pattern', () => {
      const result = detectSnapchatMedia(
        'https://snapchat.com/chat/media/download?ref=444',
        'image/png',
      );
      expect(result.type).toBe('chat');
    });
  });

  describe('unknown / fallback type', () => {
    it('falls back to chat for unmatched Snapchat URL (snapchat contains chat)', () => {
      const result = detectSnapchatMedia(
        'https://www.snapchat.com/random/path?data=123',
        'application/octet-stream',
      );
      expect(result.type).toBe('chat');
    });

    it('falls back to chat for generic media on Snapchat domain (snapchat contains chat)', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/media/photo.jpg',
        'image/jpeg',
      );
      expect(result.type).toBe('chat');
    });
  });

  describe('URL pattern matching', () => {
    it('recognizes sc-snapchat.com domain', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=1',
        'image/jpeg',
      );
      expect(result.type).toBe('snap');
      expect(result.isEphemeral).toBe(true);
    });

    it('recognizes snap-ads.com domain', () => {
      const result = detectSnapchatMedia(
        'https://snap-ads.com/bq/snapchat./v1/snap/download?id=1',
        'video/mp4',
      );
      expect(result.type).toBe('snap');
    });

    it('recognizes snapchat.com domain', () => {
      const result = detectSnapchatMedia(
        'https://www.snapchat.com/bq/snapchat./v1/snap/download?id=1',
        'image/jpeg',
      );
      expect(result.type).toBe('snap');
    });

    it('handles case-insensitive URL matching', () => {
      const result = detectSnapchatMedia(
        'https://SC-SNAPCHAT.COM/bq/snapchat./v1/SPOTLIGHT/download?id=1',
        'video/mp4',
      );
      expect(result.type).toBe('spotlight');
    });
  });

  describe('non-Snapchat URLs', () => {
    it('returns unknown for non-Snapchat URL', () => {
      const result = detectSnapchatMedia(
        'https://example.com/video.mp4',
        'video/mp4',
      );
      expect(result.type).toBe('unknown');
      expect(result.isFriendStory).toBe(false);
      expect(result.isDiscover).toBe(false);
      expect(result.isEphemeral).toBe(false);
      expect(result.friendUsername).toBeUndefined();
    });

    it('returns unknown for YouTube URL', () => {
      const result = detectSnapchatMedia(
        'https://youtube.com/watch?v=abc123',
        'video/mp4',
      );
      expect(result.type).toBe('unknown');
    });
  });

  describe('friend username extraction', () => {
    it('extracts username from /add/ path', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/add/jane_smith/story?id=1',
        'video/mp4',
      );
      expect(result.friendUsername).toBe('jane_smith');
    });

    it('extracts username from path segment', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=123',
        'image/jpeg',
      );
      expect(result.friendUsername).toBe('snapchat.');
    });

    it('extracts username from username query param when path has no 3+ char segment', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/a/b?username=cooluser',
        'video/mp4',
      );
      expect(result.friendUsername).toBe('cooluser');
    });

    it('extracts username from user query param when path is short', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/a/b?user=testuser',
        'image/jpeg',
      );
      expect(result.friendUsername).toBe('testuser');
    });

    it('extracts username from friend query param when path is short', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/a/b?friend=buddy123',
        'image/jpeg',
      );
      expect(result.friendUsername).toBe('buddy123');
    });

    it('extracts hex ID from path when no other username found', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/a/b/abcdef0123456789',
        'image/jpeg',
      );
      expect(result.friendUsername).toBe('abcdef0123456789');
    });

    it('returns undefined for short path with no relevant query params', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/a/b?id=123',
        'image/jpeg',
      );
      expect(result.friendUsername).toBeUndefined();
    });
  });

  describe('MIME type handling', () => {
    it('detects snap from explicit pattern with image MIME', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=1',
        'image/jpeg',
      );
      expect(result.type).toBe('snap');
    });

    it('detects snap from explicit pattern with video MIME', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=1',
        'video/mp4',
      );
      expect(result.type).toBe('snap');
    });

    it('generic URL with image MIME on Snapchat domain falls back to chat', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/generic/photo.jpg',
        'image/jpeg',
      );
      expect(result.type).toBe('chat');
    });

    it('generic URL with video MIME on Snapchat domain falls back to chat', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/generic/video.mp4',
        'video/mp4',
      );
      expect(result.type).toBe('chat');
    });
  });

  describe('edge cases', () => {
    it('handles empty URL', () => {
      const result = detectSnapchatMedia('', 'image/jpeg');
      expect(result.type).toBe('unknown');
      expect(result.isEphemeral).toBe(false);
    });

    it('handles malformed URL', () => {
      const result = detectSnapchatMedia('not-a-url', 'image/jpeg');
      expect(result.type).toBe('unknown');
    });

    it('handles URL with special characters in username', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/add/user-name_123/story?id=1',
        'video/mp4',
      );
      expect(result.friendUsername).toBe('user-name_123');
    });

    it('handles URL with dots in username', () => {
      const result = detectSnapchatMedia(
        'https://sc-snapchat.com/add/user.name/story?id=1',
        'video/mp4',
      );
      expect(result.friendUsername).toBe('user.name');
    });

    it('returns non-ephemeral for non-Snapchat URL', () => {
      const result = detectSnapchatMedia(
        'https://example.com/image.png',
        'image/png',
      );
      expect(result.isEphemeral).toBe(false);
    });
  });
});

describe('shouldAutoActivate', () => {
  it('returns true for sc-snapchat.com URL', () => {
    expect(shouldAutoActivate('https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=1')).toBe(true);
  });

  it('returns true for snapchat.com URL', () => {
    expect(shouldAutoActivate('https://www.snapchat.com/story/download?id=1')).toBe(true);
  });

  it('returns true for snap-ads.com URL', () => {
    expect(shouldAutoActivate('https://snap-ads.com/campaign/123')).toBe(true);
  });

  it('returns false for non-Snapchat URL', () => {
    expect(shouldAutoActivate('https://example.com/video.mp4')).toBe(false);
  });

  it('returns false for empty URL', () => {
    expect(shouldAutoActivate('')).toBe(false);
  });

  it('returns false for malformed URL', () => {
    expect(shouldAutoActivate('not-a-url')).toBe(false);
  });

  it('returns true for subdomain of snapchat.com', () => {
    expect(shouldAutoActivate('https://storage.snapchat.com/media/123')).toBe(true);
  });
});

describe('getCapturePriority', () => {
  it('returns 10 for ephemeral snap', () => {
    const info: SnapchatMediaInfo = {
      type: 'snap',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: true,
    };
    expect(getCapturePriority(info)).toBe(10);
  });

  it('returns 8 for chat', () => {
    const info: SnapchatMediaInfo = {
      type: 'chat',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: true,
    };
    expect(getCapturePriority(info)).toBe(8);
  });

  it('returns 6 for friend story', () => {
    const info: SnapchatMediaInfo = {
      type: 'story',
      isFriendStory: true,
      isDiscover: false,
      isEphemeral: true,
    };
    expect(getCapturePriority(info)).toBe(6);
  });

  it('returns 4 for spotlight', () => {
    const info: SnapchatMediaInfo = {
      type: 'spotlight',
      isFriendStory: false,
      isDiscover: true,
      isEphemeral: true,
    };
    expect(getCapturePriority(info)).toBe(4);
  });

  it('returns 2 for discover content', () => {
    const info: SnapchatMediaInfo = {
      type: 'story',
      isFriendStory: false,
      isDiscover: true,
      isEphemeral: false,
    };
    expect(getCapturePriority(info)).toBe(2);
  });

  it('returns 0 for unknown type', () => {
    const info: SnapchatMediaInfo = {
      type: 'unknown',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: false,
    };
    expect(getCapturePriority(info)).toBe(0);
  });

  it('returns 0 for non-ephemeral snap', () => {
    const info: SnapchatMediaInfo = {
      type: 'snap',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: false,
    };
    expect(getCapturePriority(info)).toBe(0);
  });

  it('returns 0 for non-friend story that is not discover', () => {
    const info: SnapchatMediaInfo = {
      type: 'story',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: false,
    };
    expect(getCapturePriority(info)).toBe(0);
  });
});

describe('generateSnapchatFilename', () => {
  it('generates filename for snap with friend username', () => {
    const info: SnapchatMediaInfo = {
      type: 'snap',
      friendUsername: 'john_doe',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: true,
    };
    const result = generateSnapchatFilename(info, '2026-06-15T10:30:00.000Z');
    expect(result).toBe('SNAP_john_doe_2026-06-15T10-30-00-000Z');
  });

  it('uses "unknown" when no friend username', () => {
    const info: SnapchatMediaInfo = {
      type: 'story',
      isFriendStory: false,
      isDiscover: true,
      isEphemeral: false,
    };
    const result = generateSnapchatFilename(info, '2026-01-01T12:00:00');
    expect(result).toBe('STORY_unknown_2026-01-01T12-00-00');
  });

  it('sanitizes special characters in username', () => {
    const info: SnapchatMediaInfo = {
      type: 'chat',
      friendUsername: 'user@name!',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: true,
    };
    const result = generateSnapchatFilename(info, '2026-06-15T08:00:00');
    expect(result).toBe('CHAT_user_name__2026-06-15T08-00-00');
  });

  it('sanitizes colons and dots in timestamp', () => {
    const info: SnapchatMediaInfo = {
      type: 'spotlight',
      isFriendStory: false,
      isDiscover: true,
      isEphemeral: false,
    };
    const result = generateSnapchatFilename(info, '2026-12-31.23.59.59');
    expect(result).toBe('SPOTLIGHT_unknown_2026-12-31-23-59-59');
  });

  it('preserves valid characters in username', () => {
    const info: SnapchatMediaInfo = {
      type: 'snap',
      friendUsername: 'user.name-123',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: true,
    };
    const result = generateSnapchatFilename(info, '2026-06-15T10:00:00');
    expect(result).toBe('SNAP_user.name-123_2026-06-15T10-00-00');
  });

  it('sanitizes spaces in username', () => {
    const info: SnapchatMediaInfo = {
      type: 'snap',
      friendUsername: 'my friend',
      isFriendStory: false,
      isDiscover: false,
      isEphemeral: true,
    };
    const result = generateSnapchatFilename(info, '2026-06-15T10:00:00');
    expect(result).toBe('SNAP_my_friend_2026-06-15T10-00-00');
  });
});

describe('integration: detectSnapchatMedia + getCapturePriority', () => {
  it('full pipeline: ephemeral snap gets priority 10', () => {
    const info = detectSnapchatMedia(
      'https://sc-snapchat.com/bq/snapchat./v1/snap/download?id=123',
      'image/jpeg',
    );
    expect(getCapturePriority(info)).toBe(10);
  });

  it('full pipeline: chat gets priority 8', () => {
    const info = detectSnapchatMedia(
      'https://sc-snapchat.com/bq/snapchat./v1/chat/media?id=456',
      'video/mp4',
    );
    expect(getCapturePriority(info)).toBe(8);
  });

  it('full pipeline: friend story gets priority 6', () => {
    const info = detectSnapchatMedia(
      'https://sc-snapchat.com/add/buddy42/story?id=1',
      'video/mp4',
    );
    expect(getCapturePriority(info)).toBe(6);
  });

  it('full pipeline: spotlight gets priority 4', () => {
    const info = detectSnapchatMedia(
      'https://sc-snapchat.com/bq/snapchat./v1/spotlight/download?id=789',
      'video/mp4',
    );
    expect(getCapturePriority(info)).toBe(4);
  });

  it('full pipeline: non-Snapchat URL gets priority 0', () => {
    const info = detectSnapchatMedia('https://example.com/video.mp4', 'video/mp4');
    expect(getCapturePriority(info)).toBe(0);
  });
});
