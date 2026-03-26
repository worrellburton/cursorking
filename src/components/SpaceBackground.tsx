"use client";

import { useEffect, useRef } from "react";

const STAR_COUNT = 300;

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Generate star positions
    const stars: { x: number; y: number; z: number; brightness: number }[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random(),
        brightness: 0.3 + Math.random() * 0.7,
      });
    }

    // Vertex shader
    const vsSource = `
      attribute vec2 a_position;
      attribute float a_brightness;
      attribute float a_size;
      uniform vec2 u_resolution;
      varying float v_brightness;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        gl_PointSize = a_size;
        v_brightness = a_brightness;
      }
    `;

    // Fragment shader
    const fsSource = `
      precision mediump float;
      varying float v_brightness;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, dist) * v_brightness;
        gl_FragColor = vec4(0.8, 0.85, 1.0, alpha);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const posLoc = gl.getAttribLocation(program, "a_position");
    const brightLoc = gl.getAttribLocation(program, "a_brightness");
    const sizeLoc = gl.getAttribLocation(program, "a_size");

    const positions = new Float32Array(stars.length * 2);
    const brightnesses = new Float32Array(stars.length);
    const sizes = new Float32Array(stars.length);

    let animId: number;
    let time = 0;

    function draw() {
      if (!gl || !canvas) return;
      time += 0.005;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.02, 0.02, 0.05, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      for (let i = 0; i < stars.length; i++) {
        positions[i * 2] = stars[i].x;
        positions[i * 2 + 1] = stars[i].y;
        // Twinkling
        brightnesses[i] =
          stars[i].brightness *
          (0.6 + 0.4 * Math.sin(time * (1 + stars[i].z * 3) + stars[i].x * 10));
        sizes[i] = 1.0 + stars[i].z * 2.5;
      }

      gl.useProgram(program);

      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const brightBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, brightBuf);
      gl.bufferData(gl.ARRAY_BUFFER, brightnesses, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(brightLoc);
      gl.vertexAttribPointer(brightLoc, 1, gl.FLOAT, false, 0, 0);

      const sizeBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(sizeLoc);
      gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, stars.length);

      // Clean up buffers
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(brightBuf);
      gl.deleteBuffer(sizeBuf);

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
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
