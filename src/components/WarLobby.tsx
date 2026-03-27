"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://cursorking-pong.worrellburton.workers.dev";

type Team = "top" | "bottom";
type Role = "king" | "sniper" | "orb" | "healer" | "gunner";

type SlotInfo = {
  team: Team;
  role: Role;
  taken: boolean;
  playerName: string;
};

type LobbyState = {
  phase: string;
  slots: SlotInfo[];
  playerCount: number;
  countdown: number | null;
};

const ROLE_INFO: Record<Role, { label: string; icon: string; color: string; desc: string }> = {
  king:   { label: "KING",   icon: "👑", color: "#ffd700", desc: "If your King dies, you lose. Slow shot, 10x damage to Orb." },
  sniper: { label: "SNIPER", icon: "🎯", color: "#ff4444", desc: "Charged shot bounces off walls. Full charge = instant kill." },
  orb:    { label: "ORB",    icon: "🔮", color: "#aa66ff", desc: "1000 HP shield. Slow moving, absorbs damage. Can't shoot." },
  healer: { label: "HEALER", icon: "💚", color: "#44ff88", desc: "Left click heals, right click empowers nearest ally." },
  gunner: { label: "GUNNER", icon: "🔫", color: "#ff8800", desc: "Fast movement, rapid-fire machine gun." },
};

export default function WarLobby({
  playerName,
  onGameStart,
  onBack,
}: {
  playerName: string;
  onGameStart: (ws: WebSocket, myId: string) => void;
  onBack: () => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef("");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [mySlot, setMySlot] = useState<{ team: Team; role: Role } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/war`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "set-name", name: playerName }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "war-welcome") {
        myIdRef.current = msg.id;
      }

      if (msg.type === "war-lobby") {
        setLobby(msg);
        if (msg.countdown !== null) {
          setCountdown(msg.countdown);
        }
      }

      if (msg.type === "war-countdown") {
        setCountdown(msg.value);
      }

      if (msg.type === "war-start") {
        // Game is starting — hand off WebSocket to the game component
        onGameStart(ws, myIdRef.current);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      // Only close if game hasn't started (ws handed off)
      if (wsRef.current === ws) {
        ws.close();
      }
    };
  }, [playerName, onGameStart]);

  const selectSlot = (team: Team, role: Role) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "select-slot", team, role }));
    setMySlot({ team, role });
  };

  const renderSlot = (slot: SlotInfo) => {
    const info = ROLE_INFO[slot.role];
    const isMe = mySlot?.team === slot.team && mySlot?.role === slot.role;
    const taken = slot.taken;

    return (
      <button
        key={`${slot.team}-${slot.role}`}
        onClick={() => !taken && selectSlot(slot.team, slot.role)}
        disabled={taken && !isMe}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "14px 12px",
          width: 110,
          background: isMe
            ? "rgba(34, 211, 238, 0.15)"
            : taken
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(255, 255, 255, 0.08)",
          border: `2px solid ${isMe ? "#22d3ee" : taken ? "rgba(255,255,255,0.1)" : info.color + "66"}`,
          borderRadius: 12,
          cursor: taken && !isMe ? "default" : "pointer",
          transition: "all 0.2s",
          opacity: taken && !isMe ? 0.5 : 1,
        }}
      >
        <span style={{ fontSize: 28 }}>{info.icon}</span>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            fontWeight: "bold",
            color: info.color,
            letterSpacing: "0.1em",
          }}
        >
          {info.label}
        </span>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 9,
            color: taken ? "#22d3ee" : "rgba(255,255,255,0.3)",
            fontWeight: taken ? "bold" : "normal",
            minHeight: 14,
          }}
        >
          {taken ? (isMe ? "YOU" : slot.playerName.toUpperCase()) : "OPEN"}
        </span>
      </button>
    );
  };

  const renderTeam = (team: Team) => {
    const teamSlots = lobby?.slots.filter(s => s.team === team) ?? [];
    const teamColor = team === "top" ? "#22d3ee" : "#ff8040";
    const teamLabel = team === "top" ? "TOP TEAM" : "BOTTOM TEAM";

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fontWeight: "bold",
            color: teamColor,
            letterSpacing: "0.2em",
            textShadow: `0 0 10px ${teamColor}66`,
          }}
        >
          {teamLabel}
        </span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {teamSlots.map(renderSlot)}
        </div>
      </div>
    );
  };

  const filledCount = lobby?.slots.filter(s => s.taken).length ?? 0;

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(8px)" }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          fontWeight: "bold",
          color: "rgba(255,255,255,0.5)",
          background: "none",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          padding: "6px 16px",
          cursor: "pointer",
        }}
      >
        ← BACK
      </button>

      {/* Title */}
      <h1
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 42,
          fontWeight: "bold",
          color: "#fff",
          letterSpacing: "0.15em",
          marginBottom: 8,
          textShadow: "0 0 20px rgba(255, 80, 20, 0.6), 0 0 40px rgba(255, 40, 0, 0.3)",
        }}
      >
        5v5 WAR
      </h1>

      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
          letterSpacing: "0.15em",
          marginBottom: 32,
        }}
      >
        CHOOSE YOUR ROLE — KILL THE ENEMY KING TO WIN
      </p>

      {/* Teams */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28, alignItems: "center" }}>
        {renderTeam("top")}

        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 18,
            fontWeight: "bold",
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "0.3em",
          }}
        >
          — VS —
        </div>

        {renderTeam("bottom")}
      </div>

      {/* Status */}
      <div
        style={{
          marginTop: 32,
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          fontWeight: "bold",
          color: countdown !== null ? "#22d3ee" : "rgba(255,255,255,0.5)",
          letterSpacing: "0.15em",
          textAlign: "center",
        }}
      >
        {countdown !== null ? (
          <span style={{ fontSize: 28, color: "#22d3ee", textShadow: "0 0 15px rgba(34, 211, 238, 0.6)" }}>
            STARTING IN {countdown}...
          </span>
        ) : (
          `${filledCount}/10 PLAYERS`
        )}
      </div>

      {/* Role description for selected slot */}
      {mySlot && (
        <div
          style={{
            marginTop: 16,
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            maxWidth: 400,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {ROLE_INFO[mySlot.role].desc}
        </div>
      )}
    </div>
  );
}
