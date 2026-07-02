/**
 * Human-Like Interaction (HLI) Engine
 * Generates realistic mouse movements, scroll behavior, and keystroke timing
 * to defeat behavioral bot detection systems.
 */

function gaussianRandom(mean = 0, stdev = 1): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export interface Point {
  x: number;
  y: number;
  timestamp: number;
}

export interface HLIConfig {
  mouseSpeed: number;        // base movement speed (px/ms)
  scrollSpeed: number;       // base scroll speed (px/event)
  keystrokeInterval: number; // base typing interval (ms)
  jitter: number;            // random jitter factor (0-1)
}

export const DEFAULT_HLI_CONFIG: HLIConfig = {
  mouseSpeed: 0.8,
  scrollSpeed: 120,
  keystrokeInterval: 85,
  jitter: 0.3,
};

/**
 * Generate a bezier curve mouse path from start to end with human-like jitter.
 */
export function generateMousePath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  config: HLIConfig = DEFAULT_HLI_CONFIG,
): Point[] {
  const points: Point[] = [];
  const now = Date.now();

  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Control points with random offset for natural curve
  const cp1x = startX + dx * 0.25 + gaussianRandom(0, 15 * config.jitter);
  const cp1y = startY + dy * 0.25 + gaussianRandom(0, 15 * config.jitter);
  const cp2x = startX + dx * 0.75 + gaussianRandom(0, 15 * config.jitter);
  const cp2y = startY + dy * 0.75 + gaussianRandom(0, 15 * config.jitter);

  // Number of steps based on distance (more steps for longer movements)
  const steps = Math.max(8, Math.min(60, Math.floor(distance / 8)));

  let prevX = startX;
  let prevY = startY;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = bezierPoint(t, startX, cp1x, cp2x, endX);
    const y = bezierPoint(t, startY, cp1y, cp2y, endY);

    // Add micro-jitter (simulates hand tremor)
    const jitterX = gaussianRandom(0, 0.5 * config.jitter);
    const jitterY = gaussianRandom(0, 0.5 * config.jitter);

    const finalX = Math.round((x + jitterX) * 10) / 10;
    const finalY = Math.round((y + jitterY) * 10) / 10;

    // Skip if too close to previous point
    const distToPrev = Math.sqrt(
      (finalX - prevX) ** 2 + (finalY - prevY) ** 2,
    );
    if (distToPrev < 1 && i > 0 && i < steps) {
      continue;
    }

    // Variable timing: slower at start/end (Fitts's Law)
    const speedFactor = Math.sin(t * Math.PI); // peaks at 0.5
    const baseDelay = (1 / config.mouseSpeed) * (1.5 - speedFactor);
    const delay = baseDelay + gaussianRandom(0, baseDelay * 0.1 * config.jitter);

    points.push({
      x: finalX,
      y: finalY,
      timestamp: now + points.reduce((sum, p) => sum + (p.timestamp - now), 0) + Math.max(1, delay),
    });

    prevX = finalX;
    prevY = finalY;
  }

  return points;
}

/**
 * Generate realistic scroll events with variable speed and direction.
 */
export function generateScrollSequence(
  startY: number,
  endY: number,
  config: HLIConfig = DEFAULT_HLI_CONFIG,
): Array<{ deltaY: number; delay: number }> {
  const events: Array<{ deltaY: number; delay: number }> = [];
  const totalDistance = Math.abs(endY - startY);
  const direction = endY > startY ? 1 : -1;

  let remaining = totalDistance;
  while (remaining > 0) {
    // Variable scroll delta (trackpad-like)
    const baseDelta = config.scrollSpeed + gaussianRandom(0, 30 * config.jitter);
    const delta = Math.min(remaining, Math.max(20, Math.round(baseDelta)));

    // Variable delay between scroll events
    const delay = Math.max(30, config.keystrokeInterval + gaussianRandom(0, 40 * config.jitter));

    events.push({ deltaY: delta * direction, delay });
    remaining -= delta;
  }

  return events;
}

/**
 * Generate realistic keystroke intervals for a given text.
 * Models burst typing patterns with pauses at word boundaries.
 */
export function generateKeystrokeTimings(
  text: string,
  config: HLIConfig = DEFAULT_HLI_CONFIG,
): number[] {
  const timings: number[] = [];
  let prevChar = '';

  for (const char of text) {
    let interval = config.keystrokeInterval + gaussianRandom(0, config.keystrokeInterval * 0.3 * config.jitter);

    // Longer pause after space (word boundary)
    if (prevChar === ' ') {
      interval += 30 + Math.random() * 60;
    }

    // Longer pause after punctuation
    if ('.!?'.includes(prevChar)) {
      interval += 80 + Math.random() * 120;
    } else if (',;:'.includes(prevChar)) {
      interval += 40 + Math.random() * 60;
    }

    // Slight variation for same-key repeats
    if (char === prevChar) {
      interval += 20 + Math.random() * 30;
    }

    timings.push(Math.max(30, Math.round(interval)));
    prevChar = char;
  }

  return timings;
}

/**
 * Generate a complete interaction sequence: move mouse, scroll, type.
 */
export function generateInteractionSequence(
  viewportWidth: number,
  viewportHeight: number,
  config: HLIConfig = DEFAULT_HLI_CONFIG,
): {
  mousePath: Point[];
  scrollEvents: Array<{ deltaY: number; delay: number }>;
  keystrokeTimings: number[];
} {
  // Random start position (simulates hand entering viewport)
  const startX = gaussianRandom(viewportWidth * 0.5, viewportWidth * 0.2);
  const startY = gaussianRandom(viewportHeight * 0.3, viewportHeight * 0.1);

  // Random target position (simulates reaching for UI element)
  const endX = gaussianRandom(viewportWidth * 0.5, viewportWidth * 0.25);
  const endY = gaussianRandom(viewportHeight * 0.7, viewportHeight * 0.15);

  const mousePath = generateMousePath(startX, startY, endX, endY, config);

  // Scroll down a bit (simulates reading content)
  const scrollEvents = generateScrollSequence(0, 200 + Math.random() * 300, config);

  // Type a short phrase
  const sampleText = 'snap story';
  const keystrokeTimings = generateKeystrokeTimings(sampleText, config);

  return { mousePath, scrollEvents, keystrokeTimings };
}
