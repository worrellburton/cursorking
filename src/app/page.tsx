"use client";

import { useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";
import MenuCursor from "@/components/MenuCursor";

type Screen = "name" | "start" | "game";

export default function Home() {
  const [playerName, setPlayerName] = useState("");
  const [screen, setScreen] = useState<Screen>("name");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleNameSubmit = () => {
    if (!playerName.trim()) return;
    setScreen("start");
  };

  const handleStart = () => {
    const audio = new Audio(`${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/menu.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audioRef.current = audio;
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
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "1.5rem",
        fontWeight: "bold",
        color: enabled ? "#22d3ee" : "rgba(34, 211, 238, 0.3)",
        border: `2px solid ${enabled ? "#22d3ee" : "rgba(34, 211, 238, 0.3)"}`,
        borderRadius: "9999px",
        padding: "16px 56px",
        background: "transparent",
        cursor: enabled ? "pointer" : "default",
        textShadow: enabled ? "0 0 10px rgba(34, 211, 238, 0.8)" : "none",
        boxShadow: enabled
          ? "0 0 15px rgba(34, 211, 238, 0.3), inset 0 0 15px rgba(34, 211, 238, 0.1)"
          : "none",
        transition: "all 0.2s",
        letterSpacing: "0.15em",
      }}
      onMouseEnter={(e) => {
        if (!enabled) return;
        e.currentTarget.style.background = "rgba(34, 211, 238, 0.15)";
        e.currentTarget.style.boxShadow =
          "0 0 30px rgba(34, 211, 238, 0.5), inset 0 0 30px rgba(34, 211, 238, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.boxShadow = enabled
          ? "0 0 15px rgba(34, 211, 238, 0.3), inset 0 0 15px rgba(34, 211, 238, 0.1)"
          : "none";
      }}
    >
      {label}
    </button>
  );

  return (
    <main className={`relative flex min-h-screen flex-col items-center justify-center overflow-hidden ${screen !== "name" ? "cursor-none" : ""}`}>
      <SpaceBackground />

      {screen === "name" && (
        <div className="relative z-10 flex flex-col items-center gap-10 text-center px-4">
          {titleEl}

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
              Enter your name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              placeholder="ENTER NAME"
              maxLength={12}
              autoFocus
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "1.25rem",
                fontWeight: "bold",
                color: "#22d3ee",
                border: "2px solid rgba(34, 211, 238, 0.5)",
                borderRadius: "9999px",
                padding: "14px 28px",
                background: "rgba(34, 211, 238, 0.05)",
                outline: "none",
                textAlign: "center",
                width: "300px",
                textShadow: "0 0 10px rgba(34, 211, 238, 0.5)",
                boxShadow: "0 0 15px rgba(34, 211, 238, 0.15), inset 0 0 15px rgba(34, 211, 238, 0.05)",
              }}
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

          {pillButton("ENTER", !!playerName.trim(), handleNameSubmit)}
        </div>
      )}

      {screen === "start" && (
        <>
          <MenuCursor name={playerName} />
          <div className="relative z-10 flex flex-col items-center gap-10 text-center px-4">
            {titleEl}

            <p
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "1.1rem",
                color: "rgba(255, 255, 255, 0.6)",
                letterSpacing: "0.1em",
              }}
            >
              Welcome, <span style={{ color: "#22d3ee" }}>{playerName.toUpperCase()}</span>
            </p>

            {pillButton("START", true, handleStart)}
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
    </main>
  );
}
