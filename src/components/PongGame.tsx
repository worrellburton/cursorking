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

export default function PongGame({ playerName }: { playerName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // All game state lives in refs — zero React re-renders during gameplay
  const gameStateRef = useRef<GameState>({
    ball: { x: 0.5, y: 0.5 },
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

  const locationRef = useRef("");

  // Only playerCount triggers React re-render (for the HUD text)
  const [playerCount, setPlayerCount] = useState(0);

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

          // Ball interpolation
          const now = performance.now();
          const dt = now - serverBallTimeRef.current;
          if (dt > 0 && dt < 200) {
            serverBallDtRef.current = serverBallDtRef.current * 0.8 + dt * 0.2;
          }
          serverBallPrevRef.current = { ...serverBallRef.current };
          serverBallRef.current = { x: state.ball.x, y: state.ball.y };
          serverBallTimeRef.current = now;

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

  const handlePointerMove = useCallback((e: PointerEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    const role = myRoleRef.current;
    if (role === "spectator") return;

    const { w, h } = canvasSizeRef.current;
    const normalizedX = Math.max(0, Math.min(1, e.clientX / w));
    const normalizedY = Math.max(0, Math.min(1, e.clientY / h));

    // Client-side prediction: apply paddle position IMMEDIATELY
    let clampedX: number;
    if (role === "left") {
      clampedX = Math.max(LEFT_X_MIN, Math.min(LEFT_X_MAX, normalizedX));
    } else {
      clampedX = Math.max(RIGHT_X_MIN, Math.min(RIGHT_X_MAX, normalizedX));
    }
    const clampedY = Math.max(PADDLE_H_NORM / 2, Math.min(1 - PADDLE_H_NORM / 2, normalizedY));
    gameStateRef.current.paddles[role] = { x: clampedX, y: clampedY };

    // Throttle network sends to ~60fps
    const now = Date.now();
    if (now - lastSentRef.current < 16) return;
    lastSentRef.current = now;

    wsRef.current?.send(JSON.stringify({ type: "paddle-move", x: normalizedX, y: normalizedY }));
  }, []);

  // Click handler: grab pickup or fire bullet
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
      const dx = mx - state.pickup.x;
      const dy = my - state.pickup.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.12) {
        wsRef.current?.send(JSON.stringify({ type: "grab-pickup" }));
        return;
      }
    }

    // Otherwise fire bullet if we have ammo
    if ((state.ammo?.[role] ?? 0) > 0) {
      wsRef.current?.send(JSON.stringify({ type: "fire-bullet" }));
    }
  }, []);

  // Touch handler for mobile
  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    mouseRef.current = { x: touch.clientX, y: touch.clientY };
    const role = myRoleRef.current;
    if (role === "spectator") return;

    const { w, h } = canvasSizeRef.current;
    const normalizedX = Math.max(0, Math.min(1, touch.clientX / w));
    const normalizedY = Math.max(0, Math.min(1, touch.clientY / h));

    let clampedX: number;
    if (role === "left") {
      clampedX = Math.max(LEFT_X_MIN, Math.min(LEFT_X_MAX, normalizedX));
    } else {
      clampedX = Math.max(RIGHT_X_MIN, Math.min(RIGHT_X_MAX, normalizedX));
    }
    const clampedY = Math.max(PADDLE_H_NORM / 2, Math.min(1 - PADDLE_H_NORM / 2, normalizedY));
    gameStateRef.current.paddles[role] = { x: clampedX, y: clampedY };

    const now = Date.now();
    if (now - lastSentRef.current < 16) return;
    lastSentRef.current = now;
    wsRef.current?.send(JSON.stringify({ type: "paddle-move", x: normalizedX, y: normalizedY }));
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    mouseRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchstart", handleTouchStart);
    };
  }, [handlePointerMove, handleClick, handleTouchMove, handleTouchStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

      // Interpolate ball
      const now = performance.now();
      const elapsed = now - serverBallTimeRef.current;
      const t = Math.min(1, elapsed / serverBallDtRef.current);
      const prevB = serverBallPrevRef.current;
      const nextB = serverBallRef.current;
      interpBallRef.current = {
        x: prevB.x + (nextB.x - prevB.x) * t,
        y: prevB.y + (nextB.y - prevB.y) * t,
      };

      const activeBall = state.winner ? state.ball : interpBallRef.current;
      const ballX = activeBall.x * W;
      const ballY = activeBall.y * H;

      const paddleLeftX = state.paddles.left.x * W;
      const paddleLeftY = state.paddles.left.y * H;
      const paddleRightX = state.paddles.right.x * W;
      const paddleRightY = state.paddles.right.y * H;
      const paddleH = PADDLE_HEIGHT * (H / 500);
      const paddleW = PADDLE_WIDTH * (W / 800);
      const ballR = BALL_SIZE * Math.min(W / 800, H / 500);

      ctx.clearRect(0, 0, W, H);

      // Slowed screen flash
      const hitAge = Date.now() - bulletHitFlashRef.current;
      if (hitAge < 500) {
        const flashAlpha = 0.15 * (1 - hitAge / 500);
        ctx.save();
        ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // Center line
      ctx.setLineDash([12, 12]);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Score
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.font = `bold ${Math.floor(H * 0.15)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(state.score.left), W / 4, H * 0.18);
      ctx.fillText(String(state.score.right), (W * 3) / 4, H * 0.18);

      // Player names above scores
      const nameSize = Math.max(14, Math.floor(H * 0.025));
      ctx.font = `bold ${nameSize}px 'Courier New', monospace`;

      if (state.names.left) {
        ctx.fillStyle = "rgba(34, 211, 238, 0.6)";
        ctx.fillText(state.names.left.toUpperCase(), W / 4, H * 0.05);
        if (state.locations?.left) {
          const locSize = Math.max(10, Math.floor(H * 0.016));
          ctx.font = `${locSize}px 'Courier New', monospace`;
          ctx.fillStyle = "rgba(34, 211, 238, 0.3)";
          ctx.fillText(state.locations.left.toUpperCase(), W / 4, H * 0.05 + nameSize * 0.9);
          ctx.font = `bold ${nameSize}px 'Courier New', monospace`;
        }
      }
      if (state.names.right) {
        ctx.fillStyle = "rgba(244, 63, 94, 0.6)";
        ctx.fillText(state.names.right.toUpperCase(), (W * 3) / 4, H * 0.05);
        if (state.locations?.right) {
          const locSize = Math.max(10, Math.floor(H * 0.016));
          ctx.font = `${locSize}px 'Courier New', monospace`;
          ctx.fillStyle = "rgba(244, 63, 94, 0.3)";
          ctx.fillText(state.locations.right.toUpperCase(), (W * 3) / 4, H * 0.05 + nameSize * 0.9);
          ctx.font = `bold ${nameSize}px 'Courier New', monospace`;
        }
      }

      // Left paddle
      ctx.save();
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = state.slowed?.left ? 40 : 20;
      ctx.fillStyle = state.slowed?.left ? "#ff4444" : "#22d3ee";
      const lx = paddleLeftX - paddleW / 2;
      const ly = paddleLeftY - paddleH / 2;
      ctx.beginPath();
      ctx.roundRect(lx, ly, paddleW, paddleH, 4);
      ctx.fill();
      ctx.restore();

      // Right paddle
      ctx.save();
      ctx.shadowColor = "#f43f5e";
      ctx.shadowBlur = state.slowed?.right ? 40 : 20;
      ctx.fillStyle = state.slowed?.right ? "#ff4444" : "#f43f5e";
      const rx = paddleRightX - paddleW / 2;
      const ry = paddleRightY - paddleH / 2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, paddleW, paddleH, 4);
      ctx.fill();
      ctx.restore();

      // Compute ball speed for glow scaling
      const prev = prevBallRef.current;
      const dx = ballX - prev.x;
      const dy = ballY - prev.y;
      const frameSpeed = Math.sqrt(dx * dx + dy * dy);
      ballSpeedRef.current = ballSpeedRef.current * 0.9 + frameSpeed * 0.1;
      prevBallRef.current = { x: ballX, y: ballY };

      const speedFactor = Math.min(3, 1 + ballSpeedRef.current / 8);

      // Ball trail
      const trail = ballTrailRef.current;
      trail.push({ x: ballX, y: ballY, age: 0 });
      while (trail.length > 20) trail.shift();

      for (let i = 0; i < trail.length; i++) {
        trail[i].age++;
        const tt = trail[i];
        const life = 1 - tt.age / 25;
        if (life <= 0) continue;

        const r = ballR * life * 0.8;
        const trailGlowR = r * (2.5 + speedFactor);
        const grad = ctx.createRadialGradient(tt.x, tt.y, 0, tt.x, tt.y, trailGlowR);
        grad.addColorStop(0, `rgba(255, 200, 50, ${life * 0.4 * speedFactor})`);
        grad.addColorStop(0.3, `rgba(255, 100, 20, ${life * 0.3 * speedFactor})`);
        grad.addColorStop(0.7, `rgba(200, 30, 0, ${life * 0.1 * speedFactor})`);
        grad.addColorStop(1, "rgba(100, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tt.x, tt.y, trailGlowR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball
      ctx.save();
      const ballGlowR = ballR * (3 + speedFactor * 1.5);
      const ballGrad = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, ballGlowR);
      ballGrad.addColorStop(0, "rgba(255, 255, 255, 1)");
      ballGrad.addColorStop(0.15, `rgba(255, 240, 180, ${0.7 + speedFactor * 0.1})`);
      ballGrad.addColorStop(0.3, `rgba(255, 160, 50, ${0.3 + speedFactor * 0.15})`);
      ballGrad.addColorStop(0.6, `rgba(255, 60, 10, ${0.1 + speedFactor * 0.1})`);
      ballGrad.addColorStop(1, "rgba(200, 0, 0, 0)");
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballGlowR, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 15 + speedFactor * 10;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Bullets
      if (state.bullets) {
        for (const b of state.bullets) {
          const bx = b.x * W;
          const by = b.y * H;
          const bulletColor = b.owner === "left" ? "#22d3ee" : "#f43f5e";

          ctx.save();
          // Bullet glow
          const bGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 12);
          bGrad.addColorStop(0, bulletColor);
          bGrad.addColorStop(0.5, `${bulletColor}66`);
          bGrad.addColorStop(1, "transparent");
          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.arc(bx, by, 12, 0, Math.PI * 2);
          ctx.fill();

          // Bullet core
          ctx.shadowColor = bulletColor;
          ctx.shadowBlur = 15;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(bx, by, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Bullet pickup
      if (state.pickup?.active) {
        const px = state.pickup.x * W;
        const py = state.pickup.y * H;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);

        ctx.save();
        // Outer pulse ring
        ctx.strokeStyle = `rgba(255, 220, 50, ${pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 35 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();

        // Pickup glow
        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, 40);
        pGrad.addColorStop(0, `rgba(255, 220, 50, ${pulse})`);
        pGrad.addColorStop(0.3, `rgba(255, 160, 20, ${pulse * 0.6})`);
        pGrad.addColorStop(0.6, `rgba(255, 100, 0, ${pulse * 0.2})`);
        pGrad.addColorStop(1, "transparent");
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(px, py, 40, 0, Math.PI * 2);
        ctx.fill();

        // Pickup icon
        ctx.shadowColor = "#ffdd33";
        ctx.shadowBlur = 25;
        ctx.fillStyle = "#ffdd33";
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();

        // "AMMO x3" label
        ctx.font = `bold 13px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffdd33";
        ctx.shadowBlur = 10;
        ctx.fillText("AMMO x3", px, py + 28);
        ctx.restore();
      }

      // Ammo counter (bottom of screen, near cursor side)
      if (role === "left" || role === "right") {
        const myAmmo = state.ammo?.[role] ?? 0;
        if (myAmmo > 0) {
          ctx.save();
          const ammoX = W / 2;
          const ammoY = H - 30;
          const bulletColor = role === "left" ? "#22d3ee" : "#f43f5e";

          // Draw bullet dots
          for (let i = 0; i < myAmmo; i++) {
            const dotX = ammoX - (myAmmo - 1) * 12 / 2 + i * 12;
            ctx.shadowColor = bulletColor;
            ctx.shadowBlur = 10;
            ctx.fillStyle = bulletColor;
            ctx.beginPath();
            ctx.arc(dotX, ammoY, 4, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.font = `bold 10px 'Courier New', monospace`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.shadowBlur = 0;
          ctx.fillText("CLICK TO FIRE", ammoX, ammoY + 16);
          ctx.restore();
        }
      }

      // Slowed indicator
      if (role !== "spectator" && state.slowed?.[role]) {
        ctx.save();
        const slowSize = Math.max(14, Math.floor(H * 0.022));
        ctx.font = `bold ${slowSize}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff4444";
        ctx.shadowColor = "#ff4444";
        ctx.shadowBlur = 15;
        const blink = Math.sin(Date.now() / 150) > 0 ? 1 : 0.3;
        ctx.globalAlpha = blink;
        ctx.fillText("SLOWED!", W / 2, H * 0.12);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Mouse cursor + glow
      ctx.save();
      const cursorColor = "#ffffff";
      const glowRGB = "255, 255, 255";

      const glowGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 50);
      glowGrad.addColorStop(0, `rgba(${glowRGB}, 0.15)`);
      glowGrad.addColorStop(0.5, `rgba(${glowRGB}, 0.05)`);
      glowGrad.addColorStop(1, `rgba(${glowRGB}, 0)`);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 50, 0, Math.PI * 2);
      ctx.fill();

      // Cursor arrow
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
      ctx.fillStyle = cursorColor;
      ctx.shadowColor = cursorColor;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Player name label next to cursor
      const myName = role === "left" ? state.names.left : role === "right" ? state.names.right : "";
      if (myName) {
        const labelSize = Math.max(11, Math.floor(H * 0.018));
        ctx.font = `bold ${labelSize}px 'Courier New', monospace`;
        ctx.textAlign = "left";
        const nameColor = role === "left" ? "#22d3ee" : "#f43f5e";
        ctx.fillStyle = nameColor;
        ctx.shadowColor = nameColor;
        ctx.shadowBlur = 8;
        ctx.fillText(myName.toUpperCase(), 18, 28);
      }
      ctx.restore();

      // Waiting for player message
      if (count < 2 && !state.winner && role !== "spectator") {
        ctx.save();
        const waitSize = Math.max(16, Math.floor(H * 0.03));
        ctx.font = `${waitSize}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
        ctx.globalAlpha = 0.4 + pulse * 0.3;
        ctx.fillText("WAITING FOR PLAYER...", W / 2, H / 2);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Countdown overlay
      if (cd !== null) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, W, H);

        const cdSize = Math.max(60, Math.floor(H * 0.2));
        ctx.font = `bold ${cdSize}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#22d3ee";
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 40;
        ctx.fillText(String(cd), W / 2, H / 2 + cdSize * 0.35);
        ctx.restore();
      }

      // Winner overlay
      if (state.winner) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, W, H);

        const winSize = Math.max(24, Math.floor(H * 0.08));
        ctx.font = `bold ${winSize}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#22d3ee";
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 30;
        ctx.fillText(`${state.winner.toUpperCase()} WINS!`, W / 2, H / 2 - winSize * 0.3);

        const subSize = Math.max(14, Math.floor(H * 0.025));
        ctx.font = `${subSize}px 'Courier New', monospace`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.shadowBlur = 0;
        ctx.fillText("New game starting soon...", W / 2, H / 2 + winSize * 0.8);
        ctx.restore();
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
        className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full px-5 py-2"
        style={{
          fontFamily: "'Courier New', monospace",
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(34, 197, 94, 0.2)",
          boxShadow: "0 0 20px rgba(34, 197, 94, 0.15), inset 0 0 10px rgba(34, 197, 94, 0.05)",
          animation: "glow-pulse 2s ease-in-out infinite",
        }}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: "#22c55e",
            boxShadow: "0 0 8px #22c55e, 0 0 16px rgba(34, 197, 94, 0.5)",
            animation: "glow-dot 1.5s ease-in-out infinite",
          }}
        />
        <span
          className="text-sm font-bold"
          style={{
            color: "#22c55e",
            textShadow: "0 0 10px rgba(34, 197, 94, 0.8)",
          }}
        >
          {playerCount}
        </span>
        <span className="text-xs text-gray-400">
          GLOBAL PLAYERS
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
