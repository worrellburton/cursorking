"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://cursorking-pong.worrellburton.workers.dev";

type Team = "top" | "bottom";
type Role = "king" | "sniper" | "orb" | "healer" | "gunner";
const ROLES: Role[] = ["king", "sniper", "orb", "healer", "gunner"];

type SlotInfo = {
  team: Team;
  role: Role;
  taken: boolean;
  playerName: string;
  playerId: string | null;
};

type LobbyState = {
  phase: string;
  slots: SlotInfo[];
  playerCount: number;
  countdown: number | null;
};

const ROLE_INFO: Record<Role, { label: string; icon: string; color: string; desc: string; hp: number; ability: string }> = {
  king:   { label: "KING",   icon: "👑", color: "#ffd700", hp: 100, desc: "If your King dies, you lose.", ability: "Slow shot (5s cooldown), 10x damage to Orb. Empowered = instant recharge." },
  sniper: { label: "SNIPER", icon: "🎯", color: "#ff4444", hp: 100, desc: "Hold to charge, release to fire.", ability: "Shot bounces off walls. Full charge = instant kill. Empowered = super bullet." },
  orb:    { label: "ORB",    icon: "🔮", color: "#aa66ff", hp: 1000, desc: "Slow-moving shield that absorbs damage.", ability: "Blocks bullets for allies. Can't shoot. Empowered = grows bigger." },
  healer: { label: "HEALER", icon: "💚", color: "#44ff88", hp: 100, desc: "Support role that keeps the team alive.", ability: "Left click = heal nearest ally. Right click = empower nearest ally." },
  gunner: { label: "GUNNER", icon: "🔫", color: "#ff8800", hp: 100, desc: "Fast and aggressive.", ability: "Rapid-fire machine gun. Fastest movement. Empowered = double fire rate." },
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
  const [countdown, setCountdown] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<{ team: Team; role: Role } | null>(null);
  const handedOffRef = useRef(false);

  useEffect(() => {
    handedOffRef.current = false;

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
        setCountdown(msg.countdown);
        // Sync selected role from server state
        if (myIdRef.current) {
          const mySlot = msg.slots.find((s: SlotInfo) => s.playerId === myIdRef.current);
          if (mySlot) {
            setSelectedRole({ team: mySlot.team, role: mySlot.role });
          } else {
            setSelectedRole(null);
          }
        }
      }

      if (msg.type === "war-countdown") {
        setCountdown(msg.value);
      }

      if (msg.type === "war-start") {
        handedOffRef.current = true;
        wsRef.current = null; // prevent cleanup from closing
        onGameStart(ws, myIdRef.current);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      if (!handedOffRef.current && wsRef.current === ws) {
        ws.close();
      }
    };
  }, [playerName, onGameStart]);

  const selectSlot = (team: Team, role: Role) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "select-slot", team, role }));
  };

  const renderSlot = (slot: SlotInfo) => {
    const info = ROLE_INFO[slot.role];
    const isMe = slot.playerId === myIdRef.current;
    const taken = slot.taken;

    return (
      <button
        key={`${slot.team}-${slot.role}`}
        onClick={() => selectSlot(slot.team, slot.role)}
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
      style={{ background: "rgba(0, 0, 0, 0.9)", backdropFilter: "blur(8px)", overflowY: "auto" }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          position: "fixed",
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
          zIndex: 30,
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
          marginBottom: 24,
        }}
      >
        CHOOSE YOUR ROLE — KILL THE ENEMY KING TO WIN
      </p>

      {/* Teams */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "center" }}>
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
          marginTop: 24,
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

      {/* Role card for selected slot */}
      {selectedRole && (
        <div
          style={{
            marginTop: 20,
            padding: "16px 24px",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${ROLE_INFO[selectedRole.role].color}44`,
            borderRadius: 12,
            maxWidth: 420,
            textAlign: "center",
          }}
        >
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: "bold",
            color: ROLE_INFO[selectedRole.role].color,
            letterSpacing: "0.1em",
            marginBottom: 6,
          }}>
            {ROLE_INFO[selectedRole.role].icon} {ROLE_INFO[selectedRole.role].label} — {ROLE_INFO[selectedRole.role].hp} HP
          </div>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.5,
            marginBottom: 4,
          }}>
            {ROLE_INFO[selectedRole.role].desc}
          </div>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            lineHeight: 1.5,
          }}>
            {ROLE_INFO[selectedRole.role].ability}
          </div>
        </div>
      )}

      {/* Role cards overview */}
      <div style={{
        marginTop: 24,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
        maxWidth: 700,
        padding: "0 16px",
      }}>
        {ROLES.map(role => {
          const info = ROLE_INFO[role];
          const isSelected = selectedRole?.role === role;
          return (
            <div
              key={role}
              style={{
                width: 120,
                padding: "10px 8px",
                background: isSelected ? `${info.color}15` : "rgba(255,255,255,0.02)",
                border: `1px solid ${isSelected ? info.color + "55" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 10,
                textAlign: "center",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 20 }}>{info.icon}</div>
              <div style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 10,
                fontWeight: "bold",
                color: info.color,
                letterSpacing: "0.1em",
                marginTop: 4,
              }}>
                {info.label}
              </div>
              <div style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 8,
                color: "rgba(255,255,255,0.35)",
                marginTop: 4,
                lineHeight: 1.4,
              }}>
                {info.hp} HP
              </div>
              <div style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 8,
                color: "rgba(255,255,255,0.25)",
                marginTop: 2,
                lineHeight: 1.4,
              }}>
                {info.desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
