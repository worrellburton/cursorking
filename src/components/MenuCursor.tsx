"use client";

import { useEffect, useRef } from "react";

export default function MenuCursor({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -100, y: -100 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function onMove(e: PointerEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("pointermove", onMove);

    let animId: number;

    function draw() {
      if (!ctx || !canvas) return;
      const { x, y } = mouseRef.current;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      if (x < 0) {
        animId = requestAnimationFrame(draw);
        return;
      }

      // Glow — simple circle, no gradient
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Cursor arrow — no shadowBlur
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 18);
      ctx.lineTo(5, 14);
      ctx.lineTo(8, 20);
      ctx.lineTo(11, 19);
      ctx.lineTo(8, 13);
      ctx.lineTo(13, 12);
      ctx.closePath();
      ctx.fillStyle = "#22d3ee";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();

      // Name label (only if name provided)
      if (!name) {
        animId = requestAnimationFrame(draw);
        return;
      }
      ctx.save();
      ctx.font = "bold 11px 'Inter', sans-serif";
      ctx.textAlign = "left";
      const labelX = x + 16;
      const labelY = y + 18;
      const text = name.toUpperCase();
      const textWidth = ctx.measureText(text).width;

      // Background pill
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.roundRect(labelX - 6, labelY - 10, textWidth + 12, 16, 8);
      ctx.fill();

      // Text
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(text, labelX, labelY + 2);
      ctx.restore();

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [name]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-40"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
