"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import usePartySocket from "partysocket/react";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_OFFSET = 20;
const BALL_SIZE = 10;

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:1999";

type GameState = {
  ball: { x: number; y: number };
  paddles: { left: number; right: number };
  score: { left: number; right: number };
  players: { left: string | null; right: string | null };
};

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    paddles: { left: CANVAS_HEIGHT / 2, right: CANVAS_HEIGHT / 2 },
    score: { left: 0, right: 0 },
    players: { left: null, right: null },
  });
  const [myRole, setMyRole] = useState<"left" | "right" | "spectator">("spectator");
  const [playerCount, setPlayerCount] = useState(0);
  const gameStateRef = useRef(gameState);
  const myRoleRef = useRef(myRole);
  const lastSentRef = useRef(0);
  gameStateRef.current = gameState;
  myRoleRef.current = myRole;

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: "pong",
    room: "main",
    onMessage(event) {
      const msg = JSON.parse(event.data);

      if (msg.type === "game-state") {
        setGameState(msg.state);
      }
      if (msg.type === "role") {
        setMyRole(msg.role);
      }
      if (msg.type === "player-count") {
        setPlayerCount(msg.count);
      }
    },
  });

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const role = myRoleRef.current;
      if (role === "spectator") return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      // Check if cursor is within the player's 40% zone
      const relX = e.clientX - rect.left;
      const canvasDisplayWidth = rect.width;

      if (role === "left" && relX > canvasDisplayWidth * 0.4) return;
      if (role === "right" && relX < canvasDisplayWidth * 0.6) return;

      // Throttle to ~60fps
      const now = Date.now();
      if (now - lastSentRef.current < 16) return;
      lastSentRef.current = now;

      const scaleY = CANVAS_HEIGHT / rect.height;
      const y = (e.clientY - rect.top) * scaleY;
      const clampedY = Math.max(
        PADDLE_HEIGHT / 2,
        Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, y)
      );

      ws.send(JSON.stringify({ type: "paddle-move", y: clampedY }));
    },
    [ws]
  );

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [handlePointerMove]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    function draw() {
      if (!ctx) return;
      const state = gameStateRef.current;
      const role = myRoleRef.current;

      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Player's 40% zone highlight
      if (role === "left") {
        ctx.fillStyle = "rgba(34, 211, 238, 0.03)";
        ctx.fillRect(0, 0, CANVAS_WIDTH * 0.4, CANVAS_HEIGHT);
        ctx.strokeStyle = "rgba(34, 211, 238, 0.1)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH * 0.4, 0);
        ctx.lineTo(CANVAS_WIDTH * 0.4, CANVAS_HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (role === "right") {
        ctx.fillStyle = "rgba(244, 63, 94, 0.03)";
        ctx.fillRect(CANVAS_WIDTH * 0.6, 0, CANVAS_WIDTH * 0.4, CANVAS_HEIGHT);
        ctx.strokeStyle = "rgba(244, 63, 94, 0.1)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH * 0.6, 0);
        ctx.lineTo(CANVAS_WIDTH * 0.6, CANVAS_HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Center line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      // Score
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "bold 80px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(state.score.left), CANVAS_WIDTH / 4, 90);
      ctx.fillText(String(state.score.right), (CANVAS_WIDTH * 3) / 4, 90);

      // Left paddle
      ctx.fillStyle = "#22d3ee";
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 15;
      ctx.fillRect(
        PADDLE_OFFSET,
        state.paddles.left - PADDLE_HEIGHT / 2,
        PADDLE_WIDTH,
        PADDLE_HEIGHT
      );

      // Right paddle
      ctx.fillStyle = "#f43f5e";
      ctx.shadowColor = "#f43f5e";
      ctx.shadowBlur = 15;
      ctx.fillRect(
        CANVAS_WIDTH - PADDLE_OFFSET - PADDLE_WIDTH,
        state.paddles.right - PADDLE_HEIGHT / 2,
        PADDLE_WIDTH,
        PADDLE_HEIGHT
      );

      // Ball
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL_SIZE, 0, Math.PI * 2);
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  const roleLabel =
    myRole === "left"
      ? "You are CYAN (left) — move your mouse on the left 40%"
      : myRole === "right"
        ? "You are RED (right) — move your mouse on the right 40%"
        : "Spectating — waiting for a spot";

  return (
    <div className="relative z-10 flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[800px] items-center justify-between px-2">
        <span
          className={`text-sm font-medium ${
            myRole === "left"
              ? "text-cyan-400"
              : myRole === "right"
                ? "text-rose-400"
                : "text-gray-400"
          }`}
        >
          {roleLabel}
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          {playerCount} {playerCount === 1 ? "player" : "players"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="rounded-lg border border-white/10 shadow-2xl"
        style={{ maxWidth: "100%", height: "auto" }}
      />
    </div>
  );
}
