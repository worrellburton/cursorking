"use client";

import { useEffect, useRef, useCallback } from "react";

type Team = "top" | "bottom";
type Role = "king" | "sniper" | "orb" | "healer" | "gunner";

type PlayerData = {
  id: string;
  name: string;
  team: Team;
  role: Role;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  charging: number; // 0–1
  orbSize: number;
  empowered: boolean;
  radius: number;
};

type BulletData = {
  id: number;
  x: number;
  y: number;
  team: Team;
  sourceRole: Role;
  isSuper: boolean;
};

type HealBeam = { fromId: string; toId: string };

type WarState = {
  phase?: string;
  players: PlayerData[];
  bullets: BulletData[];
  healBeams: HealBeam[];
  winner: Team | null;
};

type KillEvent = {
  killerId: string;
  victimId: string;
  victimRole: Role;
  victimTeam: Team;
  time: number;
};

const TEAM_COLOR: Record<Team, string> = {
  top: "#22d3ee",
  bottom: "#ff8040",
};

const ROLE_ICONS: Record<Role, string> = {
  king: "👑",
  sniper: "🎯",
  orb: "🔮",
  healer: "💚",
  gunner: "🔫",
};

export default function WarGame({
  ws,
  myId,
  playerName,
  onExit,
}: {
  ws: WebSocket;
  myId: string;
  playerName: string;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<WarState>({
    players: [],
    bullets: [],
    healBeams: [],
    winner: null,
  });
  const killFeedRef = useRef<KillEvent[]>([]);
  const myIdRef = useRef(myId);
  const wsRef = useRef(ws);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const sizeRef = useRef({ w: 800, h: 600 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const { w, h } = sizeRef.current;
    const x = e.clientX / w;
    const y = e.clientY / h;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor-move", x, y }));
    }
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "mouse-down", button: e.button }));
    }
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "mouse-up", button: e.button }));
    }
  }, []);

  // Prevent context menu
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      sizeRef.current = { w: canvas.width, h: canvas.height };
    }
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    const onMessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "war-state") {
        stateRef.current = msg;
      }
      if (msg.type === "war-kill") {
        killFeedRef.current.unshift({ ...msg, time: Date.now() });
        if (killFeedRef.current.length > 10) killFeedRef.current.pop();
      }
      if (msg.type === "war-over") {
        stateRef.current.winner = msg.winner;
      }
      // Server reset to lobby — exit the game
      if (msg.type === "war-lobby") {
        onExitRef.current();
      }
    };
    ws.addEventListener("message", onMessage);

    let animId: number;

    function draw() {
      if (!ctx || !canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      const state = stateRef.current;
      const myPlayer = state.players.find(p => p.id === myIdRef.current);

      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 20; i++) {
        const x = (i / 20) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        const y = (i / 20) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Midline
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Team territory labels
      ctx.save();
      ctx.font = "bold 12px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = TEAM_COLOR.top + "30";
      ctx.fillText("TOP TEAM", W / 2, 60);
      ctx.fillStyle = TEAM_COLOR.bottom + "30";
      ctx.fillText("BOTTOM TEAM", W / 2, H - 48);
      ctx.restore();

      // Heal beams
      for (const beam of state.healBeams) {
        const from = state.players.find(p => p.id === beam.fromId);
        const to = state.players.find(p => p.id === beam.toId);
        if (!from || !to) continue;

        const grad = ctx.createLinearGradient(
          from.x * W, from.y * H, to.x * W, to.y * H
        );
        grad.addColorStop(0, "rgba(68, 255, 136, 0.1)");
        grad.addColorStop(0.5, "rgba(68, 255, 136, 0.5)");
        grad.addColorStop(1, "rgba(68, 255, 136, 0.1)");
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.shadowColor = "#44ff88";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(from.x * W, from.y * H);
        ctx.lineTo(to.x * W, to.y * H);
        ctx.stroke();
        ctx.restore();
      }

      // Bullets
      for (const b of state.bullets) {
        const bx = b.x * W;
        const by = b.y * H;
        const color = TEAM_COLOR[b.team];
        const r = b.isSuper ? 6 : (b.sourceRole === "gunner" ? 3 : 4);

        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = b.isSuper ? 15 : 8;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();

        // Sniper bullet trail
        if (b.sourceRole === "sniper") {
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(bx, by, r * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // Players
      for (const p of state.players) {
        if (!p.alive) continue;
        const px = p.x * W;
        const py = p.y * H;
        const r = p.radius * Math.max(W, H);
        const color = TEAM_COLOR[p.team];
        const isMe = p.id === myIdRef.current;

        // Empowered aura
        if (p.empowered) {
          ctx.save();
          const auraGrad = ctx.createRadialGradient(px, py, r, px, py, r + 12);
          auraGrad.addColorStop(0, "rgba(255, 255, 100, 0.12)");
          auraGrad.addColorStop(1, "rgba(255, 255, 100, 0)");
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(px, py, r + 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Player body
        ctx.save();
        if (p.role === "orb") {
          const orbGrad = ctx.createRadialGradient(px, py, 0, px, py, r);
          orbGrad.addColorStop(0, color + "30");
          orbGrad.addColorStop(0.6, color + "18");
          orbGrad.addColorStop(1, color + "50");
          ctx.fillStyle = orbGrad;
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = color + "80";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = isMe ? 15 : 8;
          ctx.globalAlpha = isMe ? 1 : 0.85;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          if (isMe) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        ctx.restore();

        // Role icon
        ctx.save();
        ctx.font = `${Math.max(12, r * 0.9)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ROLE_ICONS[p.role], px, py);
        ctx.restore();

        // Sniper charge bar
        if (p.role === "sniper" && p.charging > 0) {
          const barW = Math.max(30, r * 2.5);
          const barH = 4;
          const barX = px - barW / 2;
          const barY = py - r - 20;
          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
          const chargeColor = p.charging >= 0.95 ? "#ff4444" : "#ffaa00";
          ctx.fillStyle = chargeColor;
          ctx.shadowColor = chargeColor;
          ctx.shadowBlur = 6;
          ctx.fillRect(barX, barY, barW * p.charging, barH);
          ctx.shadowBlur = 0;
        }

        // Health bar
        const hpBarW = Math.max(34, r * 2.5);
        const hpBarH = 4;
        const hpX = px - hpBarW / 2;
        const hpY = py - r - 12;
        const hpRatio = p.hp / p.maxHp;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(hpX - 1, hpY - 1, hpBarW + 2, hpBarH + 2);
        ctx.fillStyle = hpRatio > 0.5 ? "#44ff88" : hpRatio > 0.25 ? "#ffaa00" : "#ff4444";
        ctx.fillRect(hpX, hpY, hpBarW * hpRatio, hpBarH);

        // Name + role label
        ctx.save();
        ctx.font = "bold 10px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = isMe ? "#fff" : "rgba(255,255,255,0.6)";
        ctx.fillText(`${p.name.toUpperCase()}`, px, py + r + 14);
        ctx.font = "8px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText(p.role.toUpperCase(), px, py + r + 24);
        ctx.restore();
      }

      // Dead players
      for (const p of state.players) {
        if (p.alive) continue;
        const px = p.x * W;
        const py = p.y * H;
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☠", px, py);
        ctx.font = "bold 8px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(255, 80, 80, 0.6)";
        ctx.fillText(p.name.toUpperCase(), px, py + 16);
        ctx.restore();
      }

      // === HUD ===

      // My role indicator (top left)
      if (myPlayer) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(8, 8, 220, myPlayer.empowered ? 72 : 56);

        ctx.font = "bold 14px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = TEAM_COLOR[myPlayer.team];
        ctx.fillText(
          `${ROLE_ICONS[myPlayer.role]} ${myPlayer.role.toUpperCase()} — ${myPlayer.team.toUpperCase()} TEAM`,
          16, 28
        );

        ctx.font = "bold 12px 'Inter', sans-serif";
        ctx.fillStyle = myPlayer.hp > 50 ? "#44ff88" : myPlayer.hp > 25 ? "#ffaa00" : "#ff4444";
        ctx.fillText(`HP: ${Math.ceil(myPlayer.hp)}/${myPlayer.maxHp}`, 16, 48);

        if (myPlayer.empowered) {
          ctx.fillStyle = "#ffff66";
          ctx.font = "bold 10px 'Inter', sans-serif";
          ctx.fillText("⚡ EMPOWERED", 16, 64);
        }

        // Dead indicator
        if (!myPlayer.alive) {
          ctx.fillStyle = "rgba(255, 60, 60, 0.8)";
          ctx.font = "bold 12px 'Inter', sans-serif";
          ctx.fillText("DEAD — SPECTATING", 16, myPlayer.empowered ? 80 : 64);
        }
        ctx.restore();
      }

      // Team alive counts (top center)
      const topAlive = state.players.filter(p => p.team === "top" && p.alive).length;
      const botAlive = state.players.filter(p => p.team === "bottom" && p.alive).length;
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(W / 2 - 80, 8, 160, 28);
      ctx.font = "bold 14px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = TEAM_COLOR.top;
      ctx.fillText(`${topAlive}`, W / 2 - 40, 27);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText("vs", W / 2, 27);
      ctx.fillStyle = TEAM_COLOR.bottom;
      ctx.fillText(`${botAlive}`, W / 2 + 40, 27);
      ctx.restore();

      // Kill feed (top right)
      const now = Date.now();
      const visibleKills = killFeedRef.current.filter(k => now - k.time < 6000);
      if (visibleKills.length > 0) {
        ctx.save();
        const feedH = visibleKills.length * 18 + 8;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(W - 280, 8, 272, feedH);

        for (let i = 0; i < visibleKills.length; i++) {
          const k = visibleKills[i];
          const age = (now - k.time) / 6000;
          const killer = state.players.find(p => p.id === k.killerId);
          const victim = state.players.find(p => p.id === k.victimId);
          const killerName = k.killerId === "disconnect" ? "DISCONNECT" : (killer?.name ?? "?");
          const text = `${killerName} → ${victim?.name ?? "?"} (${k.victimRole.toUpperCase()})`;

          ctx.globalAlpha = Math.max(0, 1 - age * 1.5);
          ctx.font = "bold 10px 'Inter', sans-serif";
          ctx.textAlign = "right";
          ctx.fillStyle = TEAM_COLOR[k.victimTeam === "top" ? "bottom" : "top"];
          ctx.fillText(text, W - 16, 24 + i * 18);
        }
        ctx.restore();
      }

      // Winner overlay
      if (state.winner) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, W, H);

        const winnerIsMyTeam = myPlayer?.team === state.winner;
        const text = winnerIsMyTeam ? "VICTORY!" : (myPlayer ? "DEFEAT" : `${state.winner.toUpperCase()} TEAM WINS`);
        const color = winnerIsMyTeam ? "#44ff88" : "#ff4444";

        ctx.font = `bold ${Math.min(80, W * 0.08)}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        ctx.fillText(text, W / 2, H / 2 - 30);
        ctx.shadowBlur = 0;

        ctx.font = "bold 18px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(`${state.winner.toUpperCase()} TEAM WINS`, W / 2, H / 2 + 10);

        ctx.font = "13px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText("Returning to lobby...", W / 2, H / 2 + 40);
        ctx.restore();
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      ws.removeEventListener("message", onMessage);
    };
  }, [ws, handleMouseMove, handleMouseDown, handleMouseUp]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-10"
      style={{ width: "100vw", height: "100vh", cursor: "crosshair" }}
    />
  );
}
