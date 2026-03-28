"use client";

import { useEffect, useRef, useState } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export default function LogoAnimation({
  isMobile,
  onComplete,
  onLogoAppear,
}: {
  isMobile: boolean;
  onComplete: () => void;
  onLogoAppear?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"cursor" | "explode" | "done">("cursor");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    // Animation state
    const startTime = performance.now();
    const cursorStart = { x: -40, y: H * 0.35 };
    const cursorEnd = { x: W / 2, y: H / 2 - (isMobile ? 20 : 40) };
    // On mobile, skip everything — logo appears immediately
    if (isMobile) {
      setPhase("done");
      onLogoAppear?.();
      setTimeout(() => onComplete(), 100);
      return () => {};
    }
    const cursorDuration = 1200;
    const clickTime = cursorDuration + 200;
    const explodeTime = clickTime + 150;
    const titleFadeStart = explodeTime + 300;
    const doneTime = explodeTime + 1800;

    let particles: Particle[] = [];
    let exploded = false;
    let cursorClickScale = 1;

    const fireColors = [
      "#fff",
      "#ffe8b0",
      "#ffd080",
      "#ffb040",
      "#ff8020",
      "#ff4010",
      "#cc2000",
      "#22d3ee",
      "#18a8bf",
    ];

    function spawnExplosion(cx: number, cy: number) {
      const count = isMobile ? 80 : 150;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 8;
        const life = 40 + Math.random() * 60;
        particles.push({
          x: cx + (Math.random() - 0.5) * 60,
          y: cy + (Math.random() - 0.5) * 30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 2,
          life,
          maxLife: life,
          size: 2 + Math.random() * 5,
          color: fireColors[Math.floor(Math.random() * fireColors.length)],
        });
      }
    }

    function drawCursor(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      scale: number
    ) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 22);
      ctx.lineTo(6, 17);
      ctx.lineTo(10, 25);
      ctx.lineTo(14, 23);
      ctx.lineTo(10, 16);
      ctx.lineTo(16, 15);
      ctx.closePath();
      ctx.fillStyle = "#22d3ee";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }

    let animId: number;
    let stopped = false;
    function draw() {
      if (stopped) return;
      const now = performance.now();
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, W, H);

      // Phase: cursor moving in
      if (elapsed < clickTime) {
        const t = Math.min(1, elapsed / cursorDuration);
        // Ease out cubic
        const e = 1 - Math.pow(1 - t, 3);
        const cx = cursorStart.x + (cursorEnd.x - cursorStart.x) * e;
        const cy = cursorStart.y + (cursorEnd.y - cursorStart.y) * e;
        drawCursor(ctx, cx, cy, 1);
      }
      // Click + explosion
      else if (elapsed < doneTime) {
        // Click animation (scale down then up)
        if (elapsed < explodeTime) {
          const ct = (elapsed - clickTime) / (explodeTime - clickTime);
          cursorClickScale = 1 - 0.3 * Math.sin(ct * Math.PI);
          drawCursor(ctx, cursorEnd.x, cursorEnd.y, cursorClickScale);
        }

        // Spawn explosion once
        if (elapsed >= explodeTime && !exploded) {
          exploded = true;
          spawnExplosion(cursorEnd.x, cursorEnd.y);
          setPhase("explode");
          onLogoAppear?.();
        }

        // Draw cursor fading out after explosion
        if (elapsed >= explodeTime && elapsed < explodeTime + 500) {
          const fade = 1 - (elapsed - explodeTime) / 500;
          ctx.globalAlpha = fade;
          drawCursor(ctx, cursorEnd.x, cursorEnd.y, 1);
          ctx.globalAlpha = 1;
        }

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08; // gravity
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.life--;

          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }

          const alpha = p.life / p.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Title fade overlay (radial reveal)
        if (elapsed >= titleFadeStart) {
          const revealT = Math.min(
            1,
            (elapsed - titleFadeStart) / (doneTime - titleFadeStart)
          );
          if (revealT >= 0.3 && phaseRef.current !== "done") {
            setPhase("done");
          }
        }
      } else {
        // Animation complete — stop the loop
        if (phaseRef.current !== "done") {
          setPhase("done");
        }
        onComplete();
        stopped = true;
        return;
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      stopped = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-30"
        style={{ width: "100vw", height: "100vh" }}
      />
      {/* Logo that fades in with fire glow */}
      <div
        style={{
          opacity: phase === "done" ? 1 : phase === "explode" ? 0.6 : 0,
          transform:
            phase === "done"
              ? "scale(1)"
              : phase === "explode"
                ? "scale(1.1)"
                : "scale(0.8)",
          transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
          position: "relative",
          zIndex: 10,
          filter: "drop-shadow(0 0 15px rgba(255, 160, 40, 0.8)) drop-shadow(0 0 40px rgba(255, 80, 10, 0.6)) drop-shadow(0 0 80px rgba(200, 30, 0, 0.4))",
          animation: phase === "done" ? "logo-fire-glow 2s ease-in-out infinite" : "none",
        }}
      >
        <img
          src={`${isMobile ? "" : ""}${process.env.NODE_ENV === "production" ? "/cursorking" : ""}/logo.svg`}
          alt="CursorKing"
          style={{
            width: isMobile ? 280 : 500,
            height: "auto",
          }}
        />
      </div>
    </>
  );
}
