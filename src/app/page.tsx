"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";
import MenuCursor from "@/components/MenuCursor";
import HowItWorks from "@/components/HowItWorks";
import LogoAnimation from "@/components/LogoAnimation";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://cursorking-pong.worrellburton.workers.dev";

type Screen = "name" | "howItWorks" | "start" | "game";
type LobbyCursor = { x: number; y: number; name: string };

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [screen, setScreen] = useState<Screen>("name");
  const [isMobile, setIsMobile] = useState(false);
  const [lobbyPlayerCount, setLobbyPlayerCount] = useState(0);
  const [lobbyCursors, setLobbyCursors] = useState<LobbyCursor[]>([]);
  const [logoAnimDone, setLogoAnimDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lobbyWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024);
    setIsMobile(mobile);
  }, []);

  // Lobby WebSocket: connect when on start or howItWorks screen
  // NOTE: Requires worker deploy with ?mode=lobby support to avoid stealing player slots
  useEffect(() => {
    if (screen !== "start" && screen !== "howItWorks") {
      if (lobbyWsRef.current) {
        lobbyWsRef.current.close();
        lobbyWsRef.current = null;
      }
      setLobbyCursors([]);
      return;
    }

    // Connect in lobby mode so we never take a player slot
    const wsUrl = `${WS_URL}${WS_URL.includes("?") ? "&" : "?"}mode=lobby`;
    const ws = new WebSocket(wsUrl);
    lobbyWsRef.current = ws;
    let isLobby = true;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "set-name", name: playerName }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      // If server assigned us a player role, it doesn't support lobby mode yet
      // Close immediately to avoid stealing a slot
      if (msg.type === "role" && (msg.role === "left" || msg.role === "right")) {
        isLobby = false;
        ws.close();
        lobbyWsRef.current = null;
        return;
      }
      if (msg.type === "player-count") {
        setLobbyPlayerCount(msg.count);
      }
      if (msg.type === "cursors") {
        setLobbyCursors(msg.cursors);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isLobby && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "cursor-move",
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
          })
        );
      }
    };
    window.addEventListener("pointermove", onPointerMove);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      ws.close();
      lobbyWsRef.current = null;
    };
  }, [screen, playerName]);

  const handleNameSubmit = () => {
    if (!playerName.trim()) return;
    const base = process.env.NODE_ENV === "production" ? "/cursorking" : "";
    const audio = new Audio(`${base}/music.mp3`);
    audio.volume = 0.5;
    audio.loop = true;
    audio.load();
    audioRef.current = audio;

    // Play CURSOR KING.mp3 on the start screen
    const cursorKingAudio = new Audio(`${base}/CURSOR KING.mp3`);
    cursorKingAudio.volume = 0.6;
    cursorKingAudio.play().catch(() => {});

    setLogoAnimDone(false);
    setScreen("start");
  };

  const handleStart = () => {
    const base = process.env.NODE_ENV === "production" ? "/cursorking" : "";
    if (!audioRef.current) {
      const audio = new Audio(`${base}/music.mp3`);
      audio.volume = 0.5;
      audio.loop = true;
      audioRef.current = audio;
    }
    audioRef.current.play().catch(() => {});

    // Close lobby WS early so the server frees any player slot before the game WS connects
    if (lobbyWsRef.current) {
      lobbyWsRef.current.close();
      lobbyWsRef.current = null;
    }

    setScreen("game");
  };

  const handleLogoComplete = useCallback(() => {
    setLogoAnimDone(true);
  }, []);

  const pillButton = (label: string, enabled: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={!enabled}
      className="arena-btn"
      style={{
        fontFamily: "Inter, sans-serif",
        fontSize: isMobile ? "1.1rem" : "1.5rem",
        fontWeight: "bold",
        color: enabled ? "#fff" : "rgba(255, 255, 255, 0.12)",
        border: `2px solid ${enabled ? "rgba(255, 160, 50, 0.8)" : "rgba(255, 160, 50, 0.12)"}`,
        borderRadius: "9999px",
        padding: isMobile ? "14px 36px" : "16px 56px",
        background: enabled ? "rgba(255, 80, 20, 0.1)" : "transparent",
        cursor: enabled ? "pointer" : "default",
        textShadow: enabled
          ? "0 0 10px rgba(255, 200, 50, 1), 0 0 20px rgba(255, 120, 20, 0.8), 0 0 40px rgba(255, 60, 10, 0.5)"
          : "none",
        boxShadow: enabled
          ? "0 0 15px rgba(255, 120, 20, 0.4), 0 0 30px rgba(255, 60, 10, 0.2), inset 0 0 15px rgba(255, 120, 20, 0.1)"
          : "none",
        transition: "all 0.3s",
        letterSpacing: "0.15em",
        animation: enabled ? "fire-glow 1.5s ease-in-out infinite" : "none",
      }}
      onMouseEnter={(e) => {
        if (!enabled) return;
        e.currentTarget.style.background = "rgba(255, 80, 20, 0.25)";
        e.currentTarget.style.boxShadow =
          "0 0 25px rgba(255, 160, 50, 0.6), 0 0 50px rgba(255, 80, 20, 0.4), 0 0 80px rgba(255, 40, 0, 0.2), inset 0 0 25px rgba(255, 120, 20, 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255, 80, 20, 0.1)";
        e.currentTarget.style.boxShadow = enabled
          ? "0 0 15px rgba(255, 120, 20, 0.4), 0 0 30px rgba(255, 60, 10, 0.2), inset 0 0 15px rgba(255, 120, 20, 0.1)"
          : "none";
      }}
    >
      {label}
    </button>
  );

  return (
    <main className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden ${!isMobile && screen !== "name" ? "cursor-none" : ""}`}>
      <SpaceBackground />
      {!isMobile && (screen === "start" || screen === "howItWorks") && <MenuCursor name={playerName} />}

      {/* Lobby cursors from other players */}
      {(screen === "start" || screen === "howItWorks") && lobbyCursors.map((c, i) => (
        <div
          key={i}
          className="pointer-events-none fixed z-30"
          style={{
            left: c.x * 100 + "%",
            top: c.y * 100 + "%",
            transform: "translate(-2px, -2px)",
            transition: "left 0.1s linear, top 0.1s linear",
          }}
        >
          {/* Cursor arrow */}
          <svg width="16" height="22" viewBox="0 0 16 22" style={{ filter: "drop-shadow(0 0 6px rgba(255, 160, 50, 0.6))" }}>
            <path d="M0,0 L0,18 L5,14 L8,20 L11,19 L8,13 L13,12 Z" fill="rgba(255, 160, 50, 0.7)" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
          </svg>
          {/* Name label */}
          {c.name && (
            <div
              style={{
                position: "absolute",
                left: 16,
                top: 14,
                fontFamily: "Inter, sans-serif",
                fontSize: "10px",
                fontWeight: "bold",
                color: "rgba(255, 180, 80, 0.9)",
                background: "rgba(0, 0, 0, 0.5)",
                borderRadius: "6px",
                padding: "2px 6px",
                whiteSpace: "nowrap",
                letterSpacing: "0.1em",
                textShadow: "0 0 6px rgba(255, 160, 50, 0.5)",
              }}
            >
              {c.name.toUpperCase()}
            </div>
          )}
        </div>
      ))}

      {/* Mobile badge */}
      {isMobile && screen !== "game" && (
        <div
          className="fixed top-4 left-4 z-50"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "0.6rem",
            color: "rgba(255, 255, 255, 0.4)",
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "9999px",
            padding: "4px 12px",
            letterSpacing: "0.15em",
          }}
        >
          MOBILE
        </div>
      )}

      {screen === "name" && (
        <div className="relative z-10 flex flex-col items-center gap-4 px-4">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.12)",
              border: "2px solid rgba(255, 255, 255, 0.5)",
              borderRadius: "9999px",
              padding: "12px 32px",
              backdropFilter: "blur(8px)",
            }}
          >
            <input
              className="name-input"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              placeholder="PLAYER NAME"
              maxLength={12}
              autoFocus
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "1.1rem",
                fontWeight: "bold",
                color: "#ffffff",
                border: "none",
                padding: "8px 0",
                background: "transparent",
                outline: "none",
                width: "280px",
                caretColor: "#ffffff",
                textAlign: "center",
                letterSpacing: "0.15em",
              }}
            />
          </div>
          {isMobile && playerName.trim() && (
            <button
              onClick={handleNameSubmit}
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.8rem",
                fontWeight: "bold",
                color: "#22d3ee",
                background: "transparent",
                border: "1px solid rgba(34, 211, 238, 0.4)",
                borderRadius: "9999px",
                padding: "8px 24px",
                letterSpacing: "0.15em",
                marginTop: "4px",
              }}
            >
              GO →
            </button>
          )}
        </div>
      )}

      {screen === "howItWorks" && (
        <HowItWorks isMobile={isMobile} onContinue={() => setScreen("start")} />
      )}

      {screen === "start" && (
        <>
          <div className="relative z-10 flex flex-col items-center gap-6 text-center px-4">
            {/* Animated logo: cursor flies in, clicks, explodes, title appears */}
            <LogoAnimation isMobile={isMobile} onComplete={handleLogoComplete} />

            {/* Buttons fade in after logo animation */}
            <div
              className="flex flex-col items-center"
              style={{
                marginTop: 24,
                opacity: logoAnimDone ? 1 : 0,
                transform: logoAnimDone ? "translateY(0)" : "translateY(20px)",
                transition: "opacity 0.6s ease-out 0.2s, transform 0.6s ease-out 0.2s",
              }}
            >
              {pillButton("ENTER THE ARENA", true, handleStart)}

              {/* Player count */}
              <div
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.7rem",
                  fontWeight: "bold",
                  color: "rgba(255, 255, 255, 0.35)",
                  letterSpacing: "0.2em",
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: lobbyPlayerCount > 0 ? "#22d3ee" : "rgba(255,255,255,0.2)",
                    boxShadow: lobbyPlayerCount > 0 ? "0 0 8px rgba(34, 211, 238, 0.6)" : "none",
                    display: "inline-block",
                  }}
                />
                {lobbyPlayerCount > 0 ? `${lobbyPlayerCount} ONLINE` : "CONNECTING..."}
              </div>

              <button
                onClick={() => setScreen("howItWorks")}
                className="hiw-btn"
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: isMobile ? "0.7rem" : "0.8rem",
                  fontWeight: "bold",
                  color: "#fff",
                  border: "1.5px solid rgba(34, 211, 238, 0.6)",
                  borderRadius: "9999px",
                  padding: isMobile ? "8px 24px" : "10px 32px",
                  background: "rgba(34, 211, 238, 0.06)",
                  cursor: "pointer",
                  textShadow: "0 0 10px rgba(34, 211, 238, 0.8), 0 0 20px rgba(34, 211, 238, 0.4)",
                  boxShadow: "0 0 12px rgba(34, 211, 238, 0.25), 0 0 24px rgba(34, 211, 238, 0.1), inset 0 0 10px rgba(34, 211, 238, 0.05)",
                  letterSpacing: "0.15em",
                  animation: "cyan-glow 2s ease-in-out infinite",
                  transition: "all 0.3s",
                  marginTop: 28,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(34, 211, 238, 0.15)";
                  e.currentTarget.style.boxShadow = "0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.2), inset 0 0 15px rgba(34, 211, 238, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(34, 211, 238, 0.06)";
                  e.currentTarget.style.boxShadow = "0 0 12px rgba(34, 211, 238, 0.25), 0 0 24px rgba(34, 211, 238, 0.1), inset 0 0 10px rgba(34, 211, 238, 0.05)";
                }}
              >
                HOW IT WORKS
              </button>
            </div>
          </div>
        </>
      )}

      {screen === "game" && (
        <>
          <div
            className="fixed top-4 left-4 z-50 title-fire"
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: isMobile ? "0.9rem" : "1.25rem",
              fontWeight: "bold",
              letterSpacing: "0.15em",
              pointerEvents: "none",
            }}
          >
            CURSOR<span className="title-fire-king">KING</span>
          </div>
          <PongGame playerName={playerName} isMobile={isMobile} />
        </>
      )}
      <style jsx>{`
        @keyframes cyan-glow {
          0%, 100% {
            box-shadow: 0 0 12px rgba(34, 211, 238, 0.25), 0 0 24px rgba(34, 211, 238, 0.1), inset 0 0 10px rgba(34, 211, 238, 0.05);
            border-color: rgba(34, 211, 238, 0.6);
          }
          50% {
            box-shadow: 0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.2), 0 0 60px rgba(34, 211, 238, 0.08), inset 0 0 15px rgba(34, 211, 238, 0.08);
            border-color: rgba(34, 211, 238, 0.8);
          }
        }
        @keyframes fire-glow {
          0%, 100% {
            box-shadow: 0 0 15px rgba(255, 120, 20, 0.4), 0 0 30px rgba(255, 60, 10, 0.2), inset 0 0 15px rgba(255, 120, 20, 0.1);
            border-color: rgba(255, 160, 50, 0.8);
          }
          50% {
            box-shadow: 0 0 25px rgba(255, 160, 50, 0.6), 0 0 50px rgba(255, 80, 20, 0.35), 0 0 70px rgba(255, 40, 0, 0.15), inset 0 0 20px rgba(255, 120, 20, 0.15);
            border-color: rgba(255, 200, 80, 0.9);
          }
        }
        .name-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
          font-family: Inter, sans-serif;
          font-weight: bold;
          letter-spacing: 0.15em;
        }
        @keyframes title-fire-anim {
          0%, 100% {
            color: #fff;
            text-shadow: 0 0 10px rgba(255, 200, 50, 0.8), 0 0 20px rgba(255, 120, 20, 0.6), 0 0 40px rgba(255, 60, 10, 0.4), 0 0 80px rgba(200, 30, 0, 0.2);
          }
          25% {
            color: #ffe0a0;
            text-shadow: 0 0 15px rgba(255, 220, 80, 0.9), 0 0 30px rgba(255, 160, 40, 0.7), 0 0 50px rgba(255, 80, 10, 0.5), 0 0 90px rgba(200, 30, 0, 0.3);
          }
          50% {
            color: #ffd080;
            text-shadow: 0 0 20px rgba(255, 240, 100, 1), 0 0 40px rgba(255, 180, 50, 0.8), 0 0 60px rgba(255, 100, 20, 0.5), 0 0 100px rgba(200, 40, 0, 0.3);
          }
          75% {
            color: #ffe8b0;
            text-shadow: 0 0 12px rgba(255, 200, 60, 0.85), 0 0 25px rgba(255, 140, 30, 0.65), 0 0 45px rgba(255, 70, 10, 0.45), 0 0 85px rgba(200, 30, 0, 0.25);
          }
        }
        .title-fire {
          animation: title-fire-anim 2s ease-in-out infinite;
        }
        .title-fire-king {
          animation: title-fire-anim 2s ease-in-out infinite 0.3s;
          color: #22d3ee;
        }
      `}</style>
    </main>
  );
}
