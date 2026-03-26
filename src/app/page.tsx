import CursorCanvas from "@/components/CursorCanvas";

export default function Home() {
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

      {/* Hero content */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-4">
        <h1 className="text-6xl font-bold tracking-tight text-white sm:text-8xl">
          Cursor<span className="text-cyan-400">King</span>
        </h1>
        <p className="max-w-md text-lg text-gray-400">
          Move your cursor around. See everyone else&apos;s cursors in realtime
          from all over the world.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm text-gray-300">
          <span className="font-mono text-cyan-400">{">"}</span>
          Just move your mouse to play
        </div>
      </div>

      {/* Realtime cursors overlay */}
      <CursorCanvas />
    </main>
  );
}
