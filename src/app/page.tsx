"use client";

import { useEffect, useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";
import MenuCursor from "@/components/MenuCursor";

type Screen = "name" | "start" | "game" | "mobile";

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [screen, setScreen] = useState<Screen>("name");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024);
    if (isMobile) setScreen("mobile");
  }, []);

  const handleNameSubmit = () => {
    if (!playerName.trim()) return;
    // Pre-load audio on this user gesture to unlock Chrome autoplay
    const audio = new Audio(`${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/music.mp3`);
    audio.volume = 0.5;
    audio.loop = true;
    audio.load();
    audioRef.current = audio;
    setScreen("start");
  };

  const handleStart = () => {
    // Play on this user gesture — already unlocked from name submit click
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    setScreen("game");
  };

  const titleEl = (
    <h1
      className="text-7xl font-bold tracking-widest text-white sm:text-9xl"
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        textShadow:
          "0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(34, 211, 238, 0.4), 0 0 80px rgba(34, 211, 238, 0.2)",
      }}
    >
      CURSOR
      <span
        style={{
          color: "#22d3ee",
          textShadow:
            "0 0 20px rgba(34, 211, 238, 1), 0 0 40px rgba(34, 211, 238, 0.6), 0 0 80px rgba(34, 211, 238, 0.3)",
        }}
      >
        KING
      </span>
    </h1>
  );

  const pillButton = (label: string, enabled: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={!enabled}
      className="arena-btn"
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "1.5rem",
        fontWeight: "bold",
        color: enabled ? "#fff" : "rgba(255, 255, 255, 0.12)",
        border: `2px solid ${enabled ? "rgba(255, 160, 50, 0.8)" : "rgba(255, 160, 50, 0.12)"}`,
        borderRadius: "9999px",
        padding: "16px 56px",
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
    <main className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden ${screen !== "name" ? "cursor-none" : ""}`}>
      <SpaceBackground />
      {screen === "start" && <MenuCursor name={playerName} />}

      {screen === "mobile" && (
        <div className="relative z-10 flex flex-col items-center gap-6 text-center px-8">
          <h1
            className="text-5xl font-bold tracking-widest text-white"
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              textShadow:
                "0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(34, 211, 238, 0.4)",
            }}
          >
            CURSOR
            <span
              style={{
                color: "#22d3ee",
                textShadow:
                  "0 0 20px rgba(34, 211, 238, 1), 0 0 40px rgba(34, 211, 238, 0.6)",
              }}
            >
              KING
            </span>
          </h1>
          <p
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "1rem",
              color: "rgba(255, 255, 255, 0.6)",
              letterSpacing: "0.1em",
              lineHeight: "1.8",
            }}
          >
            SORRY, NOT AVAILABLE ON MOBILE
          </p>
          <p
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "0.75rem",
              color: "rgba(255, 255, 255, 0.3)",
              letterSpacing: "0.1em",
            }}
          >
            PLEASE VISIT ON A DESKTOP BROWSER
          </p>
        </div>
      )}

      {screen === "name" && (
        <div className="relative z-10 flex items-center justify-center px-4">
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
            className="fixed top-4 left-4 z-50"
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "1.25rem",
              fontWeight: "bold",
              color: "white",
              textShadow:
                "0 0 10px rgba(34, 211, 238, 0.6), 0 0 20px rgba(34, 211, 238, 0.3)",
              letterSpacing: "0.15em",
              pointerEvents: "none",
            }}
          >
            CURSOR<span style={{ color: "#22d3ee" }}>KING</span>
          </div>
          <PongGame playerName={playerName} />
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
      `}</style>
    </main>
  );
}
