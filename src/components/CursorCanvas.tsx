"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import usePartySocket from "partysocket/react";
import Cursor from "./Cursor";

type CursorData = {
  x: number;
  y: number;
  color: string;
};

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:1999";

export default function CursorCanvas() {
  const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
  const [playerCount, setPlayerCount] = useState(1);
  const lastSentRef = useRef(0);

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    room: "main",
    onMessage(event) {
      const msg = JSON.parse(event.data);

      if (msg.type === "sync") {
        const initial = new Map<string, CursorData>();
        for (const [id, data] of Object.entries(msg.cursors)) {
          const cursor = data as { position: { x: number; y: number }; color: string };
          initial.set(id, {
            x: cursor.position.x,
            y: cursor.position.y,
            color: cursor.color,
          });
        }
        setCursors(initial);
        setPlayerCount(initial.size + 1);
      }

      if (msg.type === "update") {
        setCursors((prev) => {
          const next = new Map(prev);
          next.set(msg.id, {
            x: msg.position.x,
            y: msg.position.y,
            color: msg.color,
          });
          setPlayerCount(next.size + 1);
          return next;
        });
      }

      if (msg.type === "remove") {
        setCursors((prev) => {
          const next = new Map(prev);
          next.delete(msg.id);
          setPlayerCount(next.size + 1);
          return next;
        });
      }
    },
  });

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const now = Date.now();
      // Throttle to ~60fps
      if (now - lastSentRef.current < 16) return;
      lastSentRef.current = now;

      ws.send(
        JSON.stringify({
          type: "update",
          position: {
            x: e.clientX,
            y: e.clientY,
            pointer: e.pointerType === "touch" ? "touch" : "mouse",
          },
        })
      );
    },
    [ws]
  );

  const handlePointerLeave = useCallback(() => {
    ws.send(JSON.stringify({ type: "remove" }));
  }, [ws]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [handlePointerMove, handlePointerLeave]);

  return (
    <>
      {/* Player count */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
        {playerCount} {playerCount === 1 ? "player" : "players"} online
      </div>

      {/* Remote cursors */}
      {Array.from(cursors.entries()).map(([id, cursor]) => (
        <Cursor key={id} x={cursor.x} y={cursor.y} color={cursor.color} />
      ))}
    </>
  );
}
