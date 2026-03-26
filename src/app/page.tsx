"use client";

import { useState } from "react";
import PongGame from "@/components/PongGame";

export default function Home() {
  const [started, setStarted] = useState(false);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {!started ? (
        <div className="relative z-10 flex flex-col items-center gap-10 text-center px-4">
          <h1 className="text-7xl font-bold tracking-tight text-white sm:text-9xl">
            Cursor<span className="text-cyan-400">KING</span>
          </h1>
          <button
            onClick={() => setStarted(true)}
            className="rounded-full border-2 border-cyan-400 bg-transparent px-12 py-4 text-xl font-semibold text-cyan-400 transition-all hover:bg-cyan-400 hover:text-gray-950 hover:scale-105 active:scale-95"
          >
            Start
          </button>
        </div>
      ) : (
        <>
          <div className="fixed top-4 left-4 z-50 text-xl font-bold text-white">
            Cursor<span className="text-cyan-400">KING</span>
          </div>
          <PongGame />
        </>
      )}
    </main>
  );
}
