"use client";

import { useEffect, useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";
import MenuCursor from "@/components/MenuCursor";

type Screen = "name" | "start" | "game";

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [screen, setScreen] = useState<Screen>("name");
  const [isMobile, setIsMobile] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024);
    setIsMobile(mobile);
  }, []);

  const handleNameSubmit = () => {
    if (!playerName.trim()) return;
    const audio = new Audio(`${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/music.mp3`);
    audio.volume = 0.5;
    audio.loop = true;
    audio.load();
    audioRef.current = audio;
    setScreen("start");
  };

  const handleStart = () => {
    // Create fresh audio on this user gesture to satisfy autoplay policy
    if (!audioRef.current) {
      const audio = new Audio(`${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/music.mp3`);
      audio.volume = 0.5;
      audio.loop = true;
      audioRef.current = audio;
    }
    audioRef.current.play().catch(() => {});
    setScreen("game");
  };

  const titleEl = (
    <h1
      className={`title-fire font-bold tracking-widest ${isMobile ? "text-5xl" : "text-7xl sm:text-9xl"}`}
      style={{
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      CURSOR<span className="title-fire-king">KING</span>
    </h1>
  );

  const pillButton = (label: string, enabled: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={!enabled}
      className="arena-btn"
      style={{
        fontFamily: "'Courier New', Courier, monospace",
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
      {!isMobile && screen === "start" && <MenuCursor name={playerName} />}

      {/* Mobile badge */}
      {isMobile && screen !== "game" && (
        <div
          className="fixed top-4 left-4 z-50"
          style={{
            fontFamily: "'Courier New', monospace",
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
                fontFamily: "'Courier New', Courier, monospace",
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
          {/* Submit button for mobile (no Enter key) */}
          {isMobile && playerName.trim() && (
            <button
              onClick={handleNameSubmit}
              style={{
                fontFamily: "'Courier New', monospace",
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

      {screen === "start" && (
        <>
          <div className="relative z-10 flex flex-col items-center gap-10 text-center px-4">
            {titleEl}

            {pillButton("ENTER THE ARENA", true, handleStart)}
          </div>
        </>
      )}

      {screen === "game" && (
        <>
          <div
            className="fixed top-4 left-4 z-50 title-fire"
            style={{
              fontFamily: "'Courier New', Courier, monospace",
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
          font-family: 'Courier New', Courier, monospace;
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
