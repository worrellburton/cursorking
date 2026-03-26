"use client";

import { useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [started, setStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleStart = () => {
    if (!playerName.trim()) return;
    const audio = new Audio(`${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/menu.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audioRef.current = audio;
    setStarted(true);
  };

  const inputStyle = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: "1.25rem",
    fontWeight: "bold" as const,
    color: "#22d3ee",
    border: "2px solid rgba(34, 211, 238, 0.5)",
    borderRadius: "4px",
    padding: "12px 24px",
    background: "rgba(34, 211, 238, 0.05)",
    outline: "none",
    textAlign: "center" as const,
    width: "280px",
    textShadow: "0 0 10px rgba(34, 211, 238, 0.5)",
    boxShadow: "0 0 15px rgba(34, 211, 238, 0.15), inset 0 0 15px rgba(34, 211, 238, 0.05)",
  };

  const buttonStyle = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: "1.5rem",
    fontWeight: "bold" as const,
    color: playerName.trim() ? "#22d3ee" : "rgba(34, 211, 238, 0.3)",
    border: `2px solid ${playerName.trim() ? "#22d3ee" : "rgba(34, 211, 238, 0.3)"}`,
    borderRadius: "4px",
    padding: "16px 48px",
    background: "transparent",
    cursor: playerName.trim() ? "pointer" : "default",
    textShadow: playerName.trim() ? "0 0 10px rgba(34, 211, 238, 0.8)" : "none",
    boxShadow: playerName.trim()
      ? "0 0 15px rgba(34, 211, 238, 0.3), inset 0 0 15px rgba(34, 211, 238, 0.1)"
      : "none",
    transition: "all 0.2s",
  };

  return (
    <main className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden ${started ? "cursor-none" : ""}`}>
      <SpaceBackground />

      {!started ? (
        <div className="relative z-10 flex flex-col items-center gap-10 text-center px-4">
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

          <div className="flex flex-col items-center gap-3">
            <label
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "0.875rem",
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Choose your name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder="ENTER NAME"
              maxLength={12}
              autoFocus
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#22d3ee";
                e.currentTarget.style.boxShadow =
                  "0 0 20px rgba(34, 211, 238, 0.3), inset 0 0 20px rgba(34, 211, 238, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(34, 211, 238, 0.5)";
                e.currentTarget.style.boxShadow =
                  "0 0 15px rgba(34, 211, 238, 0.15), inset 0 0 15px rgba(34, 211, 238, 0.05)";
              }}
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!playerName.trim()}
            className="tracking-widest"
            style={buttonStyle}
            onMouseEnter={(e) => {
              if (!playerName.trim()) return;
              e.currentTarget.style.background = "rgba(34, 211, 238, 0.15)";
              e.currentTarget.style.boxShadow =
                "0 0 30px rgba(34, 211, 238, 0.5), inset 0 0 30px rgba(34, 211, 238, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.boxShadow = playerName.trim()
                ? "0 0 15px rgba(34, 211, 238, 0.3), inset 0 0 15px rgba(34, 211, 238, 0.1)"
                : "none";
            }}
          >
            [ START ]
          </button>
        </div>
      ) : (
        <>
          {/* CursorKING logo top center */}
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
    </main>
  );
}
