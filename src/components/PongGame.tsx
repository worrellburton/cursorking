"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 70;
const BALL_SIZE = 7;

// Paddle X clamp ranges (must match server)
const LEFT_X_MIN = 0.02;
const LEFT_X_MAX = 0.45;
const RIGHT_X_MIN = 0.55;
const RIGHT_X_MAX = 0.98;
const PADDLE_H_NORM = 0.14;

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://cursorking-pong.worrellburton.workers.dev";

type PaddleState = { x: number; y: number };

type GameState = {
  ball: { x: number; y: number };
  ballSize: number;
  paddles: { left: PaddleState; right: PaddleState };
  score: { left: number; right: number };
  names: { left: string; right: string };
  locations: { left: string; right: string };
  winner: string | null;
  bullets: { x: number; y: number; owner: "left" | "right" }[];
  ammo: { left: number; right: number };
  pickup: { x: number; y: number; active: boolean };
  slowed: { left: boolean; right: boolean };
};

type BallTrail = { x: number; y: number; age: number };

// Transform server coords (horizontal) to screen coords for mobile (vertical)
function serverToScreen(sx: number, sy: number, role: "left" | "right"): { x: number; y: number } {
  if (role === "left") return { x: sy, y: 1 - sx };
  return { x: 1 - sy, y: sx };
}

function screenToServer(screenX: number, screenY: number, role: "left" | "right"): { x: number; y: number } {
  if (role === "left") return { x: 1 - screenY, y: screenX };
  return { x: screenY, y: 1 - screenX };
}

// Convert 2-letter country code to flag emoji
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65
  );
}

// Extract country code from location string like "New York, US"
function extractCountryCode(loc: string): string {
  const parts = loc.split(",");
  return (parts[parts.length - 1] || "").trim();
}

export default function PongGame({ playerName, isMobile = false }: { playerName: string; isMobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // All game state lives in refs — zero React re-renders during gameplay
  const gameStateRef = useRef<GameState>({
    ball: { x: 0.5, y: 0.5 },
    ballSize: 0.018,
    paddles: { left: { x: 0.04, y: 0.5 }, right: { x: 0.96, y: 0.5 } },
    score: { left: 0, right: 0 },
    names: { left: "", right: "" },
    locations: { left: "", right: "" },
    winner: null,
    bullets: [],
    ammo: { left: 0, right: 0 },
    pickup: { x: 0.5, y: 0.92, active: false },
    slowed: { left: false, right: false },
  });
  const myRoleRef = useRef<"left" | "right" | "spectator">("spectator");
  const countdownRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const ballTrailRef = useRef<BallTrail[]>([]);
  const prevBallRef = useRef({ x: 0.5, y: 0.5 });
  const ballSpeedRef = useRef(0);
  const canvasSizeRef = useRef({ w: 800, h: 500 });
  const playerCountRef = useRef(0);
  const bulletHitFlashRef = useRef(0); // timestamp of last hit flash

  // Ball interpolation refs
  const serverBallRef = useRef({ x: 0.5, y: 0.5 });
  const serverBallPrevRef = useRef({ x: 0.5, y: 0.5 });
  const serverBallTimeRef = useRef(0);
  const serverBallDtRef = useRef(16.67);
  const interpBallRef = useRef({ x: 0.5, y: 0.5 });
  const ballVelRef = useRef({ x: 0, y: 0 }); // velocity in units/ms for extrapolation

  // Opponent paddle smoothing
  const serverPaddleRef = useRef({ left: { x: 0.04, y: 0.5 }, right: { x: 0.96, y: 0.5 } });
  const smoothPaddleRef = useRef({ left: { x: 0.04, y: 0.5 }, right: { x: 0.96, y: 0.5 } });

  const locationRef = useRef("");

  // Sound effects refs
  const sfxRef = useRef<Record<string, HTMLAudioElement>>({});
  const sfxLoadedRef = useRef(false);
  const audioUnlockedRef = useRef(false);

  // Only playerCount triggers React re-render (for the HUD text)
  const [playerCount, setPlayerCount] = useState(0);

  // Preload sound effects
  useEffect(() => {
    const base = process.env.NODE_ENV === "production" ? "/cursorking" : "";
    const sounds: Record<string, string> = {
      countdown3: `${base}/3.mp3`,
      countdown2: `${base}/2.mp3`,
      countdown1: `${base}/1.mp3`,
      go: encodeURI(`${base}/GO!.mp3`),
      roundStart: encodeURI(`${base}/ROUND START.mp3`),
      nextRound: encodeURI(`${base}/Next Round.mp3`),
      youWin: encodeURI(`${base}/YOU WIN.mp3`),
      youLost: encodeURI(`${base}/You Lost.mp3`),
      hit: `${base}/hit.mp3`,
    };
    const loaded: Record<string, HTMLAudioElement> = {};
    for (const [key, src] of Object.entries(sounds)) {
      const a = new Audio(src);
      a.volume = 0.7;
      a.preload = "auto";
      a.load();
      loaded[key] = a;
    }
    sfxRef.current = loaded;
    sfxLoadedRef.current = true;

    // Unlock audio on first user interaction (required by browsers)
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;
      // Play and immediately pause a silent sound to unlock the audio context
      for (const a of Object.values(loaded)) {
        a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      }
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("touchstart", unlock);
    window.addEventListener("pointerdown", unlock);

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  const playSfx = useCallback((name: string) => {
    const audio = sfxRef.current[name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, []);

  // Fetch player location
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(data => {
        const city = data.city || "";
        const country = data.country_code || "";
        locationRef.current = city ? `${city}, ${country}` : country;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        wsRef.current = ws;
        ws.send(JSON.stringify({ type: "set-name", name: playerName, location: locationRef.current }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "game-state") {
          const state = msg.state as GameState;

          // Check for winner transition BEFORE updating state
          if (state.winner && !gameStateRef.current.winner) {
            const role = myRoleRef.current;
            const myName = role === "left" ? state.names.left : role === "right" ? state.names.right : "";
            if (state.winner === myName) {
              playSfx("youWin");
            } else if (role === "left" || role === "right") {
              playSfx("youLost");
            }
            setTimeout(() => playSfx("nextRound"), 2000);
          }

          // Ball interpolation — compute velocity for extrapolation
          const now = performance.now();
          const dt = now - serverBallTimeRef.current;
          if (dt > 0 && dt < 200) {
            serverBallDtRef.current = serverBallDtRef.current * 0.8 + dt * 0.2;
            // Compute velocity from consecutive server positions
            const prev = serverBallRef.current;
            ballVelRef.current = {
              x: (state.ball.x - prev.x) / dt,
              y: (state.ball.y - prev.y) / dt,
            };
          }
          serverBallPrevRef.current = { ...serverBallRef.current };
          serverBallRef.current = { x: state.ball.x, y: state.ball.y };
          serverBallTimeRef.current = now;

          // Snap interpolated ball to server position on each update (smooth correction)
          interpBallRef.current = { x: state.ball.x, y: state.ball.y };

          // Store server paddle positions for opponent smoothing
          serverPaddleRef.current = {
            left: { ...state.paddles.left },
            right: { ...state.paddles.right },
          };

          // Client-side prediction: keep our own paddle position
          const role = myRoleRef.current;
          if (role === "left" || role === "right") {
            const myPaddle = gameStateRef.current.paddles[role];
            state.paddles[role] = myPaddle;
          }

          gameStateRef.current = state;
        }
        if (msg.type === "role") {
          myRoleRef.current = msg.role;
        }
        if (msg.type === "player-count") {
          playerCountRef.current = msg.count;
          setPlayerCount(msg.count);
        }
        if (msg.type === "countdown") {
          countdownRef.current = msg.value > 0 ? msg.value : null;
          if (msg.value === 3) playSfx("countdown3");
          else if (msg.value === 2) playSfx("countdown2");
          else if (msg.value === 1) playSfx("countdown1");
          else if (msg.value === 0) playSfx("go");
        }
        if (msg.type === "point-scored") {
          playSfx("roundStart");
        }
        if (msg.type === "paddle-hit") {
          playSfx("hit");
        }
        if (msg.type === "wall-hit") {
          playSfx("hit");
        }
        if (msg.type === "bullet-hit") {
          const role = myRoleRef.current;
          if (msg.target === role) {
            bulletHitFlashRef.current = Date.now();
          }
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setTimeout(connect, 1000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [playerName]);

  const sendPaddleFromScreen = useCallback((clientX: number, clientY: number) => {
    const role = myRoleRef.current;
    if (role === "spectator") return;

    const { w, h } = canvasSizeRef.current;
    const screenNX = Math.max(0, Math.min(1, clientX / w));
    const screenNY = Math.max(0, Math.min(1, clientY / h));

    // Convert screen coords to server coords on mobile
    // Offset paddle above thumb so it's visible (shift up ~8% of screen)
    let serverX: number, serverY: number;
    if (isMobile) {
      const offsetY = screenNY - 0.14;
      const s = screenToServer(screenNX, Math.max(0, Math.min(1, offsetY)), role);
      serverX = s.x;
      serverY = s.y;
    } else {
      serverX = screenNX;
      serverY = screenNY;
    }

    // Client-side prediction
    let clampedX: number;
    if (role === "left") {
      clampedX = Math.max(LEFT_X_MIN, Math.min(LEFT_X_MAX, serverX));
    } else {
      clampedX = Math.max(RIGHT_X_MIN, Math.min(RIGHT_X_MAX, serverX));
    }
    const clampedY = Math.max(PADDLE_H_NORM / 2, Math.min(1 - PADDLE_H_NORM / 2, serverY));
    gameStateRef.current.paddles[role] = { x: clampedX, y: clampedY };

    // Throttle network sends to ~120fps
    const now = Date.now();
    if (now - lastSentRef.current < 8) return;
    lastSentRef.current = now;

    wsRef.current?.send(JSON.stringify({ type: "paddle-move", x: serverX, y: serverY }));
  }, [isMobile]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    sendPaddleFromScreen(e.clientX, e.clientY);
  }, [sendPaddleFromScreen]);

  // Click/tap handler: grab pickup or fire bullet
  const handleClick = useCallback(() => {
    const role = myRoleRef.current;
    if (role === "spectator") return;
    const state = gameStateRef.current;

    // Check if clicking near pickup
    if (state.pickup?.active) {
      const { w, h } = canvasSizeRef.current;
      const mouse = mouseRef.current;
      const mx = mouse.x / w;
      const my = mouse.y / h;
      // On mobile, convert pickup position to screen coords for distance check
      let pickupScreenX = state.pickup.x;
      let pickupScreenY = state.pickup.y;
      if (isMobile && (role === "left" || role === "right")) {
        const ps = serverToScreen(state.pickup.x, state.pickup.y, role);
        pickupScreenX = ps.x;
        pickupScreenY = ps.y;
      }
      const dx = mx - pickupScreenX;
      const dy = my - pickupScreenY;
      if (Math.sqrt(dx * dx + dy * dy) < 0.15) {
        wsRef.current?.send(JSON.stringify({ type: "grab-pickup" }));
        return;
      }
    }

    // Otherwise fire bullet if we have ammo
    if ((state.ammo?.[role] ?? 0) > 0) {
      wsRef.current?.send(JSON.stringify({ type: "fire-bullet" }));
    }
  }, [isMobile]);

  // Touch handler for mobile
  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    mouseRef.current = { x: touch.clientX, y: touch.clientY };
    sendPaddleFromScreen(touch.clientX, touch.clientY);
  }, [sendPaddleFromScreen]);

  // Track touch tap vs drag for firing
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    mouseRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // If touch didn't move much, treat as a tap (fire/grab)
    const start = touchStartPosRef.current;
    const mouse = mouseRef.current;
    const dx = mouse.x - start.x;
    const dy = mouse.y - start.y;
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      handleClick();
    }
  }, [handleClick]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handlePointerMove, handleClick, handleTouchMove, handleTouchStart, handleTouchEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Polyfill roundRect for older mobile browsers
    if (!ctx.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function(x: number, y: number, w: number, h: number, r: number | number[]) {
        const radius = typeof r === "number" ? r : (r[0] ?? 0);
        this.moveTo(x + radius, y);
        this.lineTo(x + w - radius, y);
        this.arcTo(x + w, y, x + w, y + radius, radius);
        this.lineTo(x + w, y + h - radius);
        this.arcTo(x + w, y + h, x + w - radius, y + h, radius);
        this.lineTo(x + radius, y + h);
        this.arcTo(x, y + h, x, y + h - radius, radius);
        this.lineTo(x, y + radius);
        this.arcTo(x, y, x + radius, y, radius);
        this.closePath();
      };
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvasSizeRef.current = { w: canvas.width, h: canvas.height };
    }
    resize();
    window.addEventListener("resize", resize);

    let animId: number;

    function draw() {
      if (!ctx || !canvas) return;
      const state = gameStateRef.current;
      const role = myRoleRef.current;
      const mouse = mouseRef.current;
      const cd = countdownRef.current;
      const count = playerCountRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const mob = isMobile;

      // Helper: transform server normalized coords to screen pixels
      // On mobile, always rotate (default to "left" for spectators)
      const mobRole = mob ? (role === "left" || role === "right" ? role : "left") : null;
      function toScreen(sx: number, sy: number): { x: number; y: number } {
        if (mobRole) {
          const s = serverToScreen(sx, sy, mobRole);
          return { x: s.x * W, y: s.y * H };
        }
        return { x: sx * W, y: sy * H };
      }

      // Extrapolate ball — predict position using velocity, never freeze
      const now = performance.now();
      const elapsed = now - serverBallTimeRef.current;
      if (!state.winner) {
        const vel = ballVelRef.current;
        let bx = serverBallRef.current.x + vel.x * elapsed;
        let by = serverBallRef.current.y + vel.y * elapsed;
        // Client-side wall bounce during extrapolation
        if (by < 0) { by = -by; }
        if (by > 1) { by = 2 - by; }
        // Clamp to prevent wild extrapolation
        bx = Math.max(-0.05, Math.min(1.05, bx));
        interpBallRef.current = { x: bx, y: by };
      }

      const activeBall = state.winner ? state.ball : interpBallRef.current;
      const ballScreen = toScreen(activeBall.x, activeBall.y);
      const ballX = ballScreen.x;
      const ballY = ballScreen.y;

      // Smooth opponent paddle — lerp toward server position each frame
      const oppSide: "left" | "right" = (myRoleRef.current === "left") ? "right" : "left";
      const lerpFactor = 0.35; // blend speed per frame
      const sp = serverPaddleRef.current;
      const sm = smoothPaddleRef.current;
      sm.left.x += (sp.left.x - sm.left.x) * lerpFactor;
      sm.left.y += (sp.left.y - sm.left.y) * lerpFactor;
      sm.right.x += (sp.right.x - sm.right.x) * lerpFactor;
      sm.right.y += (sp.right.y - sm.right.y) * lerpFactor;

      // Use smoothed positions for opponent, raw for own paddle
      const displayPaddles = {
        left: myRoleRef.current === "left" ? state.paddles.left : sm.left,
        right: myRoleRef.current === "right" ? state.paddles.right : sm.right,
      };
      const lpScreen = toScreen(displayPaddles.left.x, displayPaddles.left.y);
      const rpScreen = toScreen(displayPaddles.right.x, displayPaddles.right.y);
      const paddleLeftX = lpScreen.x;
      const paddleLeftY = lpScreen.y;
      const paddleRightX = rpScreen.x;
      const paddleRightY = rpScreen.y;

      // On mobile, paddles are horizontal bars (swap W/H dims)
      let paddleH: number, paddleW: number;
      if (mob) {
        paddleW = PADDLE_HEIGHT * (W / 500); // long dimension is now width
        paddleH = PADDLE_WIDTH * (H / 800); // short dimension is now height
      } else {
        paddleH = PADDLE_HEIGHT * (H / 500);
        paddleW = PADDLE_WIDTH * (W / 800);
      }
      // Ball size from server (normalized) — converts to pixels, with fallback
      const serverBallSize = state.ballSize ?? 0.018;
      const ballR = serverBallSize * Math.max(W, H);

      // Determine which paddle is "mine" and which is "opponent" for coloring on mobile
      const myColor = role === "left" ? "#22d3ee" : "#f43f5e";
      const oppColor = role === "left" ? "#f43f5e" : "#22d3ee";

      ctx.clearRect(0, 0, W, H);

      // Slowed screen flash
      const hitAge = Date.now() - bulletHitFlashRef.current;
      if (hitAge < 500) {
        const flashAlpha = 0.15 * (1 - hitAge / 500);
        ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Center line + center circle
      ctx.setLineDash([12, 12]);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (mob) {
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
      } else {
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Center circle (like a hockey rink faceoff circle)
      const centerR = Math.min(W, H) * 0.08;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mob ? W / 2 : W / 2, H / 2, centerR, 0, Math.PI * 2);
      ctx.stroke();
      // Small dot at center
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(mob ? W / 2 : W / 2, H / 2, 3, 0, Math.PI * 2);
      ctx.fill();

      // Score & names
      ctx.textAlign = "center";
      // Helper: draw location tag with flag + pill background
      function drawLocationTag(c: CanvasRenderingContext2D, cx: number, cy: number, loc: string, color: string, fontSize: number) {
        const cc = extractCountryCode(loc);
        const flag = countryFlag(cc);
        const label = flag ? `${flag}  ${loc.toUpperCase()}` : loc.toUpperCase();

        c.font = `bold ${fontSize}px 'Inter', sans-serif`;
        const textW = c.measureText(label).width;
        const padX = fontSize * 0.6;
        const padY = fontSize * 0.35;
        const tagW = textW + padX * 2;
        const tagH = fontSize + padY * 2;

        // Pill background
        c.fillStyle = "rgba(0, 0, 0, 0.35)";
        c.beginPath();
        c.roundRect(cx - tagW / 2, cy - tagH / 2, tagW, tagH, tagH / 2);
        c.fill();

        // Border
        c.strokeStyle = color;
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(cx - tagW / 2, cy - tagH / 2, tagW, tagH, tagH / 2);
        c.stroke();

        // Text
        c.fillStyle = color;
        c.textAlign = "center";
        c.fillText(label, cx, cy + fontSize * 0.35);
      }

      if (mob) {
        // Mobile: my score at bottom, opponent at top
        const myScore = role === "left" ? state.score.left : state.score.right;
        const oppScore = role === "left" ? state.score.right : state.score.left;
        const myName = role === "left" ? state.names.left : state.names.right;
        const oppName = role === "left" ? state.names.right : state.names.left;
        const oppLoc = role === "left" ? state.locations?.right : state.locations?.left;

        const scoreSize = Math.floor(W * 0.12);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.font = `bold ${scoreSize}px system-ui, sans-serif`;
        ctx.fillText(String(oppScore), W / 2, H * 0.15);
        ctx.fillText(String(myScore), W / 2, H * 0.9);

        const nameSize = Math.max(12, Math.floor(W * 0.03));
        ctx.font = `bold ${nameSize}px 'Inter', sans-serif`;
        if (oppName) {
          ctx.fillStyle = `${oppColor}99`;
          ctx.fillText(oppName.toUpperCase(), W / 2, H * 0.04);
          if (oppLoc) {
            drawLocationTag(ctx, W / 2, H * 0.04 + nameSize + 4, oppLoc, `${oppColor}66`, Math.max(8, nameSize - 4));
          }
        }
        ctx.font = `bold ${nameSize}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        if (myName) {
          ctx.fillStyle = `${myColor}99`;
          ctx.fillText(myName.toUpperCase(), W / 2, H * 0.97);
        }
      } else {
        // Desktop: left score on left, right score on right
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.font = `bold ${Math.floor(H * 0.15)}px system-ui, sans-serif`;
        ctx.fillText(String(state.score.left), W / 4, H * 0.18);
        ctx.fillText(String(state.score.right), (W * 3) / 4, H * 0.18);

        const nameSize = Math.max(14, Math.floor(H * 0.025));
        ctx.font = `bold ${nameSize}px 'Inter', sans-serif`;
        if (state.names.left) {
          ctx.fillStyle = "rgba(34, 211, 238, 0.6)";
          ctx.fillText(state.names.left.toUpperCase(), W / 4, H * 0.05);
          if (state.locations?.left) {
            const locSize = Math.max(10, Math.floor(H * 0.016));
            drawLocationTag(ctx, W / 4, H * 0.05 + nameSize * 0.6, state.locations.left, "rgba(34, 211, 238, 0.4)", locSize);
          }
        }
        if (state.names.right) {
          ctx.font = `bold ${nameSize}px 'Inter', sans-serif`;
          ctx.fillStyle = "rgba(244, 63, 94, 0.6)";
          ctx.fillText(state.names.right.toUpperCase(), (W * 3) / 4, H * 0.05);
          if (state.locations?.right) {
            const locSize = Math.max(10, Math.floor(H * 0.016));
            drawLocationTag(ctx, (W * 3) / 4, H * 0.05 + nameSize * 0.6, state.locations.right, "rgba(244, 63, 94, 0.4)", locSize);
          }
        }
      }

      // Left paddle — own paddle is white, opponent is team color
      const leftPaddleColor = state.slowed?.left ? "#ff4444" : role === "left" ? "#ffffff" : "#22d3ee";
      const lx = paddleLeftX - paddleW / 2;
      const ly = paddleLeftY - paddleH / 2;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = leftPaddleColor;
      ctx.beginPath();
      ctx.roundRect(lx - 4, ly - 4, paddleW + 8, paddleH + 8, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = leftPaddleColor;
      ctx.beginPath();
      ctx.roundRect(lx, ly, paddleW, paddleH, 4);
      ctx.fill();

      // Right paddle
      const rightPaddleColor = state.slowed?.right ? "#ff4444" : role === "right" ? "#ffffff" : "#f43f5e";
      const rx = paddleRightX - paddleW / 2;
      const ry = paddleRightY - paddleH / 2;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = rightPaddleColor;
      ctx.beginPath();
      ctx.roundRect(rx - 4, ry - 4, paddleW + 8, paddleH + 8, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = rightPaddleColor;
      ctx.beginPath();
      ctx.roundRect(rx, ry, paddleW, paddleH, 4);
      ctx.fill();

      // Compute ball speed for glow scaling
      const prev = prevBallRef.current;
      const dx = ballX - prev.x;
      const dy = ballY - prev.y;
      const frameSpeed = Math.sqrt(dx * dx + dy * dy);
      ballSpeedRef.current = ballSpeedRef.current * 0.9 + frameSpeed * 0.1;
      prevBallRef.current = { x: ballX, y: ballY };

      const speedFactor = Math.min(3, 1 + ballSpeedRef.current / 8);

      // Ball trail — simple circles, no gradients
      const trail = ballTrailRef.current;
      trail.push({ x: ballX, y: ballY, age: 0 });
      const maxTrail = Math.floor(8 + speedFactor * 10);
      while (trail.length > maxTrail) trail.shift();

      const trailLife = 12 + speedFactor * 12;
      for (let i = 0; i < trail.length; i++) {
        trail[i].age++;
        const tt = trail[i];
        const life = 1 - tt.age / trailLife;
        if (life <= 0) continue;

        const r = ballR * life * (0.8 + speedFactor * 0.4);
        ctx.globalAlpha = life * 0.5 * Math.min(speedFactor, 2);
        ctx.fillStyle = life > 0.5 ? "#ffc832" : life > 0.25 ? "#ff6414" : "#cc2000";
        ctx.beginPath();
        ctx.arc(tt.x, tt.y, r * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Ball — soft outer glow, less intense middle
      const ballGlowR = ballR * (2.5 + speedFactor);
      ctx.globalAlpha = 0.2 + speedFactor * 0.05;
      ctx.fillStyle = "#ff8020";
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballGlowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ffcc66";
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
      ctx.fill();

      // Bullets — big yellow projectiles
      if (state.bullets) {
        for (const b of state.bullets) {
          const bs = toScreen(b.x, b.y);
          const bx = bs.x;
          const by = bs.y;

          // Outer glow
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = "#ffdd33";
          ctx.beginPath();
          ctx.arc(bx, by, 18, 0, Math.PI * 2);
          ctx.fill();
          // Inner glow
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = "#ffee66";
          ctx.beginPath();
          ctx.arc(bx, by, 12, 0, Math.PI * 2);
          ctx.fill();
          // Core
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(bx, by, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Bullet pickup — simplified, no gradients or shadowBlur
      if (state.pickup?.active) {
        const ps = toScreen(state.pickup.x, state.pickup.y);
        const px = ps.x;
        const py = ps.y;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);

        // Outer pulse ring
        ctx.strokeStyle = `rgba(255, 220, 50, ${pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 35 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();

        // Pickup glow
        ctx.globalAlpha = pulse * 0.3;
        ctx.fillStyle = "#ffdd33";
        ctx.beginPath();
        ctx.arc(px, py, 30, 0, Math.PI * 2);
        ctx.fill();

        // Pickup icon
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffdd33";
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();

        // "AMMO x3" label
        ctx.font = `bold 13px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffdd33";
        ctx.fillText("AMMO x3", px, py + 28);
      }

      // Ammo counter — no shadowBlur
      if (role === "left" || role === "right") {
        const myAmmo = state.ammo?.[role] ?? 0;
        if (myAmmo > 0) {
          const ammoX = mob ? W - 30 : W / 2;
          const ammoY = mob ? H / 2 : H - 30;
          const bulletColor = role === "left" ? "#22d3ee" : "#f43f5e";

          ctx.fillStyle = bulletColor;
          for (let i = 0; i < myAmmo; i++) {
            const dotOffset = mob ? 0 : (- (myAmmo - 1) * 12 / 2 + i * 12);
            const dotX = mob ? ammoX : ammoX + dotOffset;
            const dotY = mob ? ammoY - (myAmmo - 1) * 12 / 2 + i * 12 : ammoY;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.font = `bold 10px 'Inter', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillText(mob ? "TAP" : "CLICK TO FIRE", ammoX, mob ? ammoY + (myAmmo * 12 / 2) + 16 : ammoY + 16);
        }
      }

      // Slowed indicator
      if (role !== "spectator" && state.slowed?.[role]) {
        const slowSize = Math.max(14, Math.floor(H * 0.022));
        ctx.font = `bold ${slowSize}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff4444";
        const blink = Math.sin(Date.now() / 150) > 0 ? 1 : 0.3;
        ctx.globalAlpha = blink;
        ctx.fillText("SLOWED!", W / 2, mob ? H * 0.85 : H * 0.12);
        ctx.globalAlpha = 1;
      }

      // Cursor / touch indicator — no gradients or shadowBlur
      if (mob) {
        const touchColor = role === "left" ? "#22d3ee" : role === "right" ? "#f43f5e" : "#ffffff";

        // Touch ring
        ctx.strokeStyle = `${touchColor}88`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 20, 0, Math.PI * 2);
        ctx.stroke();

        // Small center dot
        ctx.fillStyle = `${touchColor}cc`;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Desktop: cursor arrow, no gradient glow
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.translate(mouse.x, mouse.y);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 18);
        ctx.lineTo(5, 14);
        ctx.lineTo(8, 20);
        ctx.lineTo(11, 19);
        ctx.lineTo(8, 13);
        ctx.lineTo(13, 12);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Player name label next to cursor
        const myName = role === "left" ? state.names.left : role === "right" ? state.names.right : "";
        if (myName) {
          const labelSize = Math.max(11, Math.floor(H * 0.018));
          ctx.font = `bold ${labelSize}px 'Inter', sans-serif`;
          ctx.textAlign = "left";
          const nameColor = role === "left" ? "#22d3ee" : "#f43f5e";
          ctx.fillStyle = nameColor;
          ctx.fillText(myName.toUpperCase(), 18, 28);
        }
        ctx.restore();
      }

      // Opponent cursor — draw at their smoothed paddle position
      if (!mob && (role === "left" || role === "right")) {
        const oppPaddle = displayPaddles[oppSide];
        const oppScreen = toScreen(oppPaddle.x, oppPaddle.y);
        const oppCursorColor = oppSide === "left" ? "#22d3ee" : "#f43f5e";
        const oppName = oppSide === "left" ? state.names.left : state.names.right;

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.translate(oppScreen.x, oppScreen.y);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 18);
        ctx.lineTo(5, 14);
        ctx.lineTo(8, 20);
        ctx.lineTo(11, 19);
        ctx.lineTo(8, 13);
        ctx.lineTo(13, 12);
        ctx.closePath();
        ctx.fillStyle = oppCursorColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        if (oppName) {
          const labelSize = Math.max(10, Math.floor(H * 0.015));
          ctx.font = `bold ${labelSize}px 'Inter', sans-serif`;
          ctx.textAlign = "left";
          ctx.fillStyle = oppCursorColor;
          ctx.fillText(oppName.toUpperCase(), 16, 24);
        }
        ctx.restore();
      }

      // Waiting for player message
      if (count < 2 && !state.winner && role !== "spectator") {
        const t = Date.now() / 400;
        const pulse = 0.6 + 0.4 * Math.sin(t);

        const dotCount = Math.floor((Date.now() / 500) % 4);
        const dots = ".".repeat(dotCount);
        const text = `WAITING FOR PLAYER${dots}`;

        if (mob) {
          // Mobile: small text between center court and your score
          const waitSize = Math.max(10, Math.floor(W * 0.025));
          ctx.font = `bold ${waitSize}px 'Inter', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.globalAlpha = pulse;
          ctx.fillText(text, W / 2, H * 0.7);
        } else {
          const waitSize = Math.max(16, Math.floor(H * 0.03));
          ctx.font = `bold ${waitSize}px 'Inter', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = pulse;
          ctx.fillText(text, W / 2, H - 60);
        }
        ctx.globalAlpha = 1;
      }

      // Countdown overlay
      if (cd !== null) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, W, H);

        const cdSize = Math.max(60, Math.floor(H * 0.2));
        ctx.font = `bold ${cdSize}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#22d3ee";
        ctx.fillText(String(cd), W / 2, H / 2 + cdSize * 0.35);
      }

      // Winner overlay
      if (state.winner) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, W, H);

        const winSize = Math.max(24, Math.floor(H * 0.08));
        ctx.font = `bold ${winSize}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#22d3ee";
        ctx.fillText(`${state.winner.toUpperCase()} WINS!`, W / 2, H / 2 - winSize * 0.3);

        const subSize = Math.max(14, Math.floor(H * 0.025));
        ctx.font = `${subSize}px 'Inter', sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fillText("New game starting soon...", W / 2, H / 2 + winSize * 0.8);
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-10"
        style={{ width: "100vw", height: "100vh" }}
      />

      <div
        className={`fixed z-50 flex items-center rounded-full ${
          isMobile
            ? "top-4 right-4 gap-1 px-2 py-0.5"
            : "top-4 right-4 gap-2 px-5 py-2"
        }`}
        style={{
          fontFamily: "'Inter', sans-serif",
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(34, 197, 94, 0.2)",
          boxShadow: "0 0 20px rgba(34, 197, 94, 0.15), inset 0 0 10px rgba(34, 197, 94, 0.05)",
          animation: "glow-pulse 2s ease-in-out infinite",
        }}
      >
        <span
          className={`inline-block rounded-full ${isMobile ? "h-1.5 w-1.5" : "h-2.5 w-2.5"}`}
          style={{
            background: "#22c55e",
            boxShadow: "0 0 8px #22c55e, 0 0 16px rgba(34, 197, 94, 0.5)",
            animation: "glow-dot 1.5s ease-in-out infinite",
          }}
        />
        <span
          className={`font-bold ${isMobile ? "text-[10px]" : "text-sm"}`}
          style={{
            color: "#22c55e",
            textShadow: "0 0 10px rgba(34, 197, 94, 0.8)",
          }}
        >
          {playerCount}
        </span>
        <span className={`text-gray-400 ${isMobile ? "text-[8px]" : "text-xs"}`}>
          ONLINE
        </span>
      </div>

      <style jsx>{`
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.15), inset 0 0 10px rgba(34, 197, 94, 0.05); }
          50% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.3), inset 0 0 15px rgba(34, 197, 94, 0.1); }
        }
        @keyframes glow-dot {
          0%, 100% { box-shadow: 0 0 8px #22c55e, 0 0 16px rgba(34, 197, 94, 0.5); }
          50% { box-shadow: 0 0 12px #22c55e, 0 0 24px rgba(34, 197, 94, 0.8); }
        }
      `}</style>
    </>
  );
}
