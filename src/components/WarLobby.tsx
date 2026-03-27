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

type LobbyCursor = { x: number; y: number; name: string; id: string };

const ROLE_INFO: Record<Role, { label: string; icon: string; color: string; desc: string; hp: number; ability: string }> = {
  king:   { label: "KING",   icon: "👑", color: "#ffd700", hp: 100, desc: "If your King dies, you lose.", ability: "Slow shot (5s cooldown), 10x damage to Orb. Empowered = instant recharge." },
  sniper: { label: "SNIPER", icon: "🎯", color: "#ff4444", hp: 100, desc: "Hold to charge, release to fire.", ability: "Shot bounces off walls. Full charge = instant kill. Empowered = super bullet." },
  orb:    { label: "ORB",    icon: "🔮", color: "#aa66ff", hp: 1000, desc: "Slow-moving shield that absorbs damage.", ability: "Blocks bullets for allies. Can't shoot. Empowered = grows bigger." },
  healer: { label: "HEALER", icon: "💚", color: "#44ff88", hp: 100, desc: "Support role that keeps the team alive.", ability: "Left click = heal nearest ally. Right click = empower nearest ally." },
  gunner: { label: "GUNNER", icon: "🔫", color: "#ff8800", hp: 100, desc: "Fast and aggressive.", ability: "Rapid-fire machine gun. Fastest movement. Empowered = double fire rate." },
};

// Generate default empty slots
function defaultSlots(): SlotInfo[] {
  const slots: SlotInfo[] = [];
  for (const team of ["top", "bottom"] as Team[]) {
    for (const role of ROLES) {
      slots.push({ team, role, taken: false, playerName: "", playerId: null });
    }
  }
  return slots;
}

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
  const [slots, setSlots] = useState<SlotInfo[]>(defaultSlots());
  const [playerCount, setPlayerCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<{ team: Team; role: Role } | null>(null);
  const [locked, setLocked] = useState(false); // once you pick, you're locked in
  const [cursors, setCursors] = useState<LobbyCursor[]>([]);
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
        setSlots(msg.slots);
        setPlayerCount(msg.playerCount);
        setCountdown(msg.countdown);
        // Sync selected role from server
        if (myIdRef.current) {
          const mySlot = msg.slots.find((s: SlotInfo) => s.playerId === myIdRef.current);
          if (mySlot) {
            setSelectedRole({ team: mySlot.team, role: mySlot.role });
            setLocked(true);
          }
        }
      }

      if (msg.type === "war-countdown") {
        setCountdown(msg.value);
      }

      if (msg.type === "war-cursors") {
        setCursors(msg.cursors);
      }

      if (msg.type === "war-start") {
        handedOffRef.current = true;
        wsRef.current = null;
        onGameStart(ws, myIdRef.current);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    // Send cursor position
    const onPointerMove = (e: PointerEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "cursor-move",
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight,
        }));
      }
    };
    window.addEventListener("pointermove", onPointerMove);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (!handedOffRef.current && wsRef.current === ws) {
        ws.close();
      }
    };
  }, [playerName, onGameStart]);

  const selectSlot = (team: Team, role: Role) => {
    if (locked) return; // already locked into a role
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "select-slot", team, role }));
    setSelectedRole({ team, role });
    setLocked(true);
  };

  const renderSlot = (slot: SlotInfo) => {
    const info = ROLE_INFO[slot.role];
    const isMe = slot.playerId === myIdRef.current;
    const taken = slot.taken;
    const canClick = !taken && !locked;

    return (
      <button
        key={`${slot.team}-${slot.role}`}
        onClick={() => canClick && selectSlot(slot.team, slot.role)}
        disabled={!canClick}
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
              : locked
                ? "rgba(255, 255, 255, 0.03)"
                : "rgba(255, 255, 255, 0.08)",
          border: `2px solid ${isMe ? "#22d3ee" : taken ? "rgba(255,255,255,0.15)" : locked ? "rgba(255,255,255,0.05)" : info.color + "55"}`,
          borderRadius: 12,
          cursor: canClick ? "pointer" : "default",
          transition: "all 0.2s",
          opacity: (taken && !isMe) || (locked && !isMe) ? 0.45 : 1,
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
            color: isMe ? "#22d3ee" : taken ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
            fontWeight: taken ? "bold" : "normal",
            minHeight: 14,
          }}
        >
          {isMe ? "YOU ✓" : taken ? slot.playerName.toUpperCase() : "OPEN"}
        </span>
      </button>
    );
  };

  const renderTeam = (team: Team) => {
    const teamSlots = slots.filter(s => s.team === team);
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

  const filledCount = slots.filter(s => s.taken).length;

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.9)", backdropFilter: "blur(8px)", overflowY: "auto", cursor: "none" }}
    >
      {/* Lobby cursors */}
      {cursors.map((c, i) => (
        <div
          key={i}
          className="pointer-events-none fixed z-50"
          style={{
            left: c.x * 100 + "%",
            top: c.y * 100 + "%",
            transform: "translate(-2px, -2px)",
            transition: "left 0.08s linear, top 0.08s linear",
          }}
        >
          <svg width="16" height="22" viewBox="0 0 16 22" style={{ filter: "drop-shadow(0 0 6px rgba(255, 160, 50, 0.6))" }}>
            <path d="M0,0 L0,18 L5,14 L8,20 L11,19 L8,13 L13,12 Z" fill="rgba(255, 160, 50, 0.8)" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
          </svg>
          {c.name && (
            <div
              style={{
                position: "absolute",
                left: 16,
                top: 14,
                fontFamily: "Inter, sans-serif",
                fontSize: "9px",
                fontWeight: "bold",
                color: "rgba(255, 180, 80, 0.9)",
                background: "rgba(0, 0, 0, 0.6)",
                borderRadius: "5px",
                padding: "2px 6px",
                whiteSpace: "nowrap",
                letterSpacing: "0.08em",
              }}
            >
              {c.name.toUpperCase()}
            </div>
          )}
        </div>
      ))}

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
          cursor: "none",
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

      {/* Selected role card */}
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
            {ROLE_INFO[selectedRole.role].icon} {ROLE_INFO[selectedRole.role].label} — {ROLE_INFO[selectedRole.role].hp} HP — {selectedRole.team.toUpperCase()} TEAM
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
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 9,
            color: "#22d3ee",
            marginTop: 8,
            letterSpacing: "0.1em",
          }}>
            ✓ LOCKED IN — WAITING FOR PLAYERS
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
        padding: "0 16px 32px",
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
