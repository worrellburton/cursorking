"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";
import MenuCursor from "@/components/MenuCursor";
import HowItWorks from "@/components/HowItWorks";
import LogoAnimation from "@/components/LogoAnimation";
import WarLobby from "@/components/WarLobby";
import WarGame from "@/components/WarGame";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://cursorking-pong.worrellburton.workers.dev";

type Screen = "name" | "howItWorks" | "start" | "game" | "warLobby" | "warGame";
type LobbyCursor = { x: number; y: number; name: string };

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [screen, setScreen] = useState<Screen>("name");
  const [isMobile, setIsMobile] = useState(false);
  const [lobbyPlayerCount, setLobbyPlayerCount] = useState(-1); // -1 = not connected yet
  const [lobbyCursors, setLobbyCursors] = useState<LobbyCursor[]>([]);
  const [logoAnimDone, setLogoAnimDone] = useState(false);
  const [warWs, setWarWs] = useState<WebSocket | null>(null);
  const [warMyId, setWarMyId] = useState("");
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
        // Worker is live but doesn't support lobby mode — show "LIVE" (count=0)
        setLobbyPlayerCount(0);
        return;
      }
      if (msg.type === "player-count") {
        setLobbyPlayerCount(msg.count);
      }
      if (msg.type === "cursors") {
        // Filter out our own cursor so we don't see a duplicate
        setLobbyCursors(msg.cursors.filter((c: LobbyCursor) => c.name !== playerName));
      }
    };

    ws.onerror = () => {
      setLobbyPlayerCount(-1);
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

  // Start music on first interaction with the name input
  const startMusicIfNeeded = () => {
    if (audioRef.current) return;
    const audio = new Audio("/music.mp3");
    audio.volume = 0.5;
    audio.loop = true;
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const handleNameSubmit = () => {
    if (!playerName.trim()) return;
    startMusicIfNeeded();
    setLogoAnimDone(false);
    setScreen("start");
  };

  const handleLogoAppear = useCallback(() => {
    startMusicIfNeeded();
    const cursorKingAudio = new Audio(encodeURI("/CURSOR KING.mp3"));
    cursorKingAudio.volume = 0.6;
    cursorKingAudio.play().catch(() => {});
  }, []);

  const handleStart = () => {
    startMusicIfNeeded();

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

  const handleWarStart = useCallback((ws: WebSocket, myId: string) => {
    setWarWs(ws);
    setWarMyId(myId);
    setScreen("warGame");
  }, []);

  const handleWarBack = () => {
    setScreen("start");
  };

  const handleWarExit = () => {
    // Server reset to lobby — close old WS and go back to war lobby
    if (warWs) {
      warWs.close();
      setWarWs(null);
    }
    setWarMyId("");
    setScreen("warLobby");
  };

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
    <main
      className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden ${!isMobile && screen !== "name" ? "cursor-none" : ""}`}
      style={{ background: "#050510" }}
    >
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
          {/* Prompt label on mobile so users know to tap */}
          {isMobile && (
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.75rem",
                fontWeight: "bold",
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.2em",
                marginBottom: -4,
              }}
            >
              TAP TO ENTER NAME
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.12)",
              border: "2px solid rgba(255, 255, 255, 0.6)",
              borderRadius: "9999px",
              padding: isMobile ? "14px 24px" : "12px 32px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)",
            }}
          >
            <input
              className="name-input"
              type="text"
              value={playerName}
              onChange={(e) => { startMusicIfNeeded(); setPlayerName(e.target.value.slice(0, 12)); }}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              placeholder="PLAYER NAME"
              maxLength={12}
              autoFocus
              enterKeyHint="go"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: isMobile ? "1rem" : "1.1rem",
                fontWeight: "bold",
                color: "#ffffff",
                border: "none",
                padding: "8px 0",
                background: "transparent",
                outline: "none",
                width: isMobile ? "220px" : "280px",
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
                fontSize: "0.9rem",
                fontWeight: "bold",
                color: "#22d3ee",
                background: "rgba(34, 211, 238, 0.08)",
                border: "2px solid rgba(34, 211, 238, 0.5)",
                borderRadius: "9999px",
                padding: "12px 32px",
                letterSpacing: "0.15em",
                marginTop: "4px",
                boxShadow: "0 0 15px rgba(34, 211, 238, 0.2)",
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
            <LogoAnimation isMobile={isMobile} onComplete={handleLogoComplete} onLogoAppear={handleLogoAppear} />

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
                    background: lobbyPlayerCount >= 0 ? "#22c55e" : "rgba(255,255,255,0.2)",
                    boxShadow: lobbyPlayerCount >= 0 ? "0 0 8px rgba(34, 197, 94, 0.6)" : "none",
                    display: "inline-block",
                  }}
                />
                {lobbyPlayerCount > 0 ? `${lobbyPlayerCount} GLOBAL PLAYERS` : lobbyPlayerCount === 0 ? "LIVE" : "CONNECTING..."}
              </div>

              {/* 5v5 WAR button — desktop only */}
              {!isMobile && (
                <button
                  onClick={() => {
                    if (lobbyWsRef.current) {
                      lobbyWsRef.current.close();
                      lobbyWsRef.current = null;
                    }
                    setScreen("warLobby");
                  }}
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "1.1rem",
                    fontWeight: "bold",
                    color: "#fff",
                    border: "2px solid rgba(255, 60, 60, 0.7)",
                    borderRadius: "9999px",
                    padding: "14px 48px",
                    background: "rgba(255, 40, 20, 0.1)",
                    cursor: "pointer",
                    textShadow: "0 0 10px rgba(255, 60, 60, 0.8), 0 0 20px rgba(255, 30, 10, 0.5)",
                    boxShadow: "0 0 15px rgba(255, 60, 60, 0.3), 0 0 30px rgba(255, 30, 10, 0.15), inset 0 0 15px rgba(255, 60, 60, 0.08)",
                    letterSpacing: "0.15em",
                    animation: "war-glow 2s ease-in-out infinite",
                    transition: "all 0.3s",
                    marginTop: 16,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 40, 20, 0.25)";
                    e.currentTarget.style.boxShadow = "0 0 25px rgba(255, 60, 60, 0.5), 0 0 50px rgba(255, 30, 10, 0.3), inset 0 0 20px rgba(255, 60, 60, 0.12)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 40, 20, 0.1)";
                    e.currentTarget.style.boxShadow = "0 0 15px rgba(255, 60, 60, 0.3), 0 0 30px rgba(255, 30, 10, 0.15), inset 0 0 15px rgba(255, 60, 60, 0.08)";
                  }}
                >
                  ENTER 5v5 WAR
                </button>
              )}

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
                  marginTop: 14,
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
            className="fixed top-4 left-4 z-50"
            style={{
              pointerEvents: "none",
              filter: "drop-shadow(0 0 8px rgba(255, 160, 40, 0.6)) drop-shadow(0 0 20px rgba(255, 80, 10, 0.4))",
              animation: "logo-fire-glow 2s ease-in-out infinite",
            }}
          >
            <img
              src="/logo.svg"
              alt="CursorKing"
              style={{ width: isMobile ? 100 : 140, height: "auto" }}
            />
          </div>
          <PongGame playerName={playerName} isMobile={isMobile} />
        </>
      )}

      {screen === "warLobby" && (
        <>
          <SpaceBackground />
          <WarLobby
            playerName={playerName}
            onGameStart={handleWarStart}
            onBack={handleWarBack}
          />
        </>
      )}

      {screen === "warGame" && warWs && (
        <WarGame
          ws={warWs}
          myId={warMyId}
          playerName={playerName}
          onExit={handleWarExit}
        />
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
        @keyframes war-glow {
          0%, 100% {
            box-shadow: 0 0 15px rgba(255, 60, 60, 0.3), 0 0 30px rgba(255, 30, 10, 0.15), inset 0 0 15px rgba(255, 60, 60, 0.08);
            border-color: rgba(255, 60, 60, 0.7);
          }
          50% {
            box-shadow: 0 0 25px rgba(255, 80, 80, 0.5), 0 0 50px rgba(255, 40, 20, 0.25), 0 0 70px rgba(255, 20, 0, 0.1), inset 0 0 20px rgba(255, 60, 60, 0.12);
            border-color: rgba(255, 100, 100, 0.85);
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
          color: rgba(255, 255, 255, 0.55);
          font-family: Inter, sans-serif;
          font-weight: bold;
          letter-spacing: 0.15em;
        }
        @keyframes logo-fire-glow {
          0%, 100% {
            filter: drop-shadow(0 0 15px rgba(255, 160, 40, 0.8)) drop-shadow(0 0 40px rgba(255, 80, 10, 0.6)) drop-shadow(0 0 80px rgba(200, 30, 0, 0.4));
          }
          50% {
            filter: drop-shadow(0 0 25px rgba(255, 200, 60, 1)) drop-shadow(0 0 60px rgba(255, 120, 20, 0.8)) drop-shadow(0 0 100px rgba(255, 40, 0, 0.5)) drop-shadow(0 0 140px rgba(200, 20, 0, 0.3));
          }
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
