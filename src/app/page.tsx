"use client";

import { useRef, useState } from "react";
import SpaceBackground from "@/components/SpaceBackground";
import PongGame from "@/components/PongGame";

export default function Home() {
  const [started, setStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleStart = () => {
    const audio = new Audio(`${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/menu.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audioRef.current = audio;
    setStarted(true);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
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
          <button
            onClick={handleStart}
            className="tracking-widest"
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: "#22d3ee",
              border: "2px solid #22d3ee",
              borderRadius: "4px",
              padding: "16px 48px",
              background: "transparent",
              cursor: "pointer",
              textShadow: "0 0 10px rgba(34, 211, 238, 0.8)",
              boxShadow:
                "0 0 15px rgba(34, 211, 238, 0.3), inset 0 0 15px rgba(34, 211, 238, 0.1)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(34, 211, 238, 0.15)";
              e.currentTarget.style.boxShadow =
                "0 0 30px rgba(34, 211, 238, 0.5), inset 0 0 30px rgba(34, 211, 238, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.boxShadow =
                "0 0 15px rgba(34, 211, 238, 0.3), inset 0 0 15px rgba(34, 211, 238, 0.1)";
            }}
          >
            [ START ]
          </button>
        </div>
      ) : (
        <PongGame />
      )}
    </main>
  );
}
