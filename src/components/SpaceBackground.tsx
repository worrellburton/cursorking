"use client";

import { useEffect, useRef } from "react";

const SHOOTING_STAR_CHANCE = 0.003;

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Detect mobile for performance scaling
    const mob = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024);

    const starCount = mob ? 120 : 500;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Stars
    const stars = Array.from({ length: starCount }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      brightness: 0.3 + Math.random() * 0.7,
      speed: 0.0001 + Math.random() * 0.0005,
      twinkleSpeed: 1 + Math.random() * 4,
      twinkleOffset: Math.random() * Math.PI * 2,
      hue: 200 + Math.random() * 40,
    }));

    // Shooting stars
    type ShootingStar = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
    };
    const shootingStars: ShootingStar[] = [];

    // Nebula blobs (skip on mobile)
    const nebulae = mob ? [] : Array.from({ length: 4 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.1 + Math.random() * 0.15,
      hue: Math.random() > 0.5 ? 200 : 280,
      drift: 0.00005 + Math.random() * 0.0001,
      phase: Math.random() * Math.PI * 2,
    }));

    let animId: number;
    let time = 0;
    let lastFrame = performance.now();

    function draw() {
      if (!ctx || !canvas) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000); // cap at 50ms to avoid jumps
      lastFrame = now;
      time += dt;
      const W = canvas.width;
      const H = canvas.height;

      // Dark space background
      ctx.fillStyle = "#050510";
      ctx.fillRect(0, 0, W, H);

      // Nebula layers (desktop only) — simple circles, no gradients
      for (const n of nebulae) {
        const nx = (n.x + Math.sin(time * 0.1 + n.phase) * 0.02) * W;
        const ny = (n.y + Math.cos(time * 0.08 + n.phase) * 0.02) * H;
        const nr = n.r * Math.min(W, H);
        const pulse = 0.8 + 0.2 * Math.sin(time * 0.3 + n.phase);

        ctx.globalAlpha = 0.03 * pulse;
        ctx.fillStyle = n.hue === 200 ? "#4488cc" : "#8844cc";
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.015 * pulse;
        ctx.beginPath();
        ctx.arc(nx, ny, nr * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Stars — simple dots, no per-star gradients
      for (const star of stars) {
        star.y -= star.speed;
        if (star.y < -0.01) {
          star.y = 1.01;
          star.x = Math.random();
        }

        const twinkle = 0.4 + 0.6 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
        const alpha = star.brightness * twinkle;
        const size = (0.5 + star.z * 2) * (0.8 + twinkle * 0.4);
        const sx = star.x * W;
        const sy = star.y * H;

        // Bright star glow: simple larger circle at low opacity
        if (!mob && star.z > 0.7) {
          ctx.globalAlpha = alpha * 0.15;
          ctx.fillStyle = "#cceeff";
          ctx.beginPath();
          ctx.arc(sx, sy, size * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#f0f4ff";
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Shooting stars (reduced chance on mobile)
      if (Math.random() < (mob ? 0.001 : SHOOTING_STAR_CHANCE)) {
        const angle = -Math.PI / 6 + Math.random() * -Math.PI / 6;
        const speed = 4 + Math.random() * 4;
        shootingStars.push({
          x: Math.random() * W,
          y: Math.random() * H * 0.4,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * -speed,
          life: 0,
          maxLife: 30 + Math.random() * 30,
        });
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        ss.x += ss.vx;
        ss.y -= ss.vy;
        ss.life++;

        if (ss.life > ss.maxLife) {
          shootingStars.splice(i, 1);
          continue;
        }

        const progress = ss.life / ss.maxLife;
        const alpha = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        const tailLen = 40 + (1 - progress) * 40;
        const norm = Math.sqrt(ss.vx * ss.vx + ss.vy * ss.vy);

        // Simple line for both mobile and desktop (no gradients)
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = mob ? 1 : 1.5;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - (ss.vx / norm) * tailLen, ss.y + (ss.vy / norm) * tailLen);
        ctx.stroke();

        if (!mob) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(ss.x, ss.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: "100vw", height: "100vh", background: "#050510" }}
    />
  );
}
