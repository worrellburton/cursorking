import { DurableObject } from "cloudflare:workers";

const PADDLE_HEIGHT = 0.14;
const PADDLE_WIDTH = 0.018;
const BALL_SIZE_START = 0.018;
const BALL_SIZE_MIN = 0.006;
const BALL_SPEED = 0.007;
const BALL_ACCEL = 1.06;
const BALL_TICK_ACCEL = 1.0004;
const WIN_SCORE = 3;
const RESTART_DELAY = 3000;

const LEFT_X_MIN = 0.02;
const LEFT_X_MAX = 0.45;
const RIGHT_X_MIN = 0.55;
const RIGHT_X_MAX = 0.98;

const BULLET_SPEED = 0.015;
const BULLET_PICKUP_RADIUS = 0.06;
const BULLET_HIT_RADIUS = 0.05;
const SLOW_DURATION = 3000; // ms of slowdown
const SLOW_FACTOR = 0.35;  // paddle speed multiplier when slowed
const PICKUP_SPAWN_INTERVAL = 5000; // ms between pickup spawns

type PaddleState = { x: number; y: number };
type Bullet = { x: number; y: number; vx: number; owner: "left" | "right" };

type GameState = {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { left: PaddleState; right: PaddleState };
  score: { left: number; right: number };
  rallyTicks: number; // tracks how long ball has been in play for size/speed scaling
};

export class PongRoom extends DurableObject {
  players: Map<WebSocket, "left" | "right"> = new Map();
  names: Map<WebSocket, string> = new Map();
  locations: Map<WebSocket, string> = new Map();
  spectators: Set<WebSocket> = new Set();
  allSockets: Set<WebSocket> = new Set();
  cursors: Map<WebSocket, { x: number; y: number; name: string }> = new Map();
  state_: GameState;
  interval: ReturnType<typeof setInterval> | null = null;
  running = false;
  winner: string | null = null;

  // Bullet system
  bullets: Bullet[] = [];
  ammo: { left: number; right: number } = { left: 0, right: 0 };
  pickup: { x: number; y: number; active: boolean } = { x: 0.5, y: 0.5, active: false };
  slowedUntil: { left: number; right: number } = { left: 0, right: 0 };
  nextPickupTime = 0;
  cursorPositions: { left: { x: number; y: number }; right: { x: number; y: number } } = {
    left: { x: 0.04, y: 0.5 },
    right: { x: 0.96, y: 0.5 },
  };
  prevPaddles: { left: PaddleState; right: PaddleState } = {
    left: { x: 0.04, y: 0.5 },
    right: { x: 0.96, y: 0.5 },
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.state_ = this.freshState();
  }

  freshState(): GameState {
    const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      ball: {
        x: 0.5,
        y: 0.5,
        vx: BALL_SPEED * dir * Math.cos(angle),
        vy: BALL_SPEED * Math.sin(angle),
      },
      paddles: {
        left: { x: 0.04, y: 0.5 },
        right: { x: 0.96, y: 0.5 },
      },
      score: { left: 0, right: 0 },
      rallyTicks: 0,
    };
  }

  resetBall(scoredSide: "left" | "right") {
    const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;
    const dir = scoredSide === "left" ? -1 : 1;
    this.state_.ball = {
      x: 0.5,
      y: 0.5,
      vx: BALL_SPEED * dir * Math.cos(angle),
      vy: BALL_SPEED * Math.sin(angle),
    };
    this.state_.rallyTicks = 0;
  }

  getNameForRole(role: "left" | "right"): string {
    for (const [ws, r] of this.players) {
      if (r === role) return this.names.get(ws) ?? "";
    }
    return "";
  }

  getLocationForRole(role: "left" | "right"): string {
    for (const [ws, r] of this.players) {
      if (r === role) return this.locations.get(ws) ?? "";
    }
    return "";
  }

  assignRole(ws: WebSocket): "left" | "right" | "spectator" {
    const roles = new Set(this.players.values());
    if (!roles.has("left")) {
      this.players.set(ws, "left");
      return "left";
    }
    if (!roles.has("right")) {
      this.players.set(ws, "right");
      return "right";
    }
    this.spectators.add(ws);
    return "spectator";
  }

  startGame() {
    if (this.running) return;
    this.winner = null;
    const fresh = this.freshState();
    this.state_ = { ...fresh, score: { left: 0, right: 0 } };
    this.bullets = [];
    this.ammo = { left: 0, right: 0 };
    this.pickup = { x: 0.5, y: 0.5, active: false };
    this.slowedUntil = { left: 0, right: 0 };
    this.prevPaddles = { left: { ...this.state_.paddles.left }, right: { ...this.state_.paddles.right } };
    this.nextPickupTime = Date.now() + PICKUP_SPAWN_INTERVAL;
    this.broadcastState();

    this.broadcast(JSON.stringify({ type: "countdown", value: 3 }));
    setTimeout(() => {
      this.broadcast(JSON.stringify({ type: "countdown", value: 2 }));
    }, 1000);
    setTimeout(() => {
      this.broadcast(JSON.stringify({ type: "countdown", value: 1 }));
    }, 2000);
    setTimeout(() => {
      this.broadcast(JSON.stringify({ type: "countdown", value: 0 }));
      this.running = true;
      this.interval = setInterval(() => this.tick(), 1000 / 60);
    }, 3000);
  }

  stopGame() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick() {
    if (this.winner) return;

    const { ball, paddles } = this.state_;
    const now = Date.now();

    // Track rally length for ball size scaling
    this.state_.rallyTicks++;

    // Continuous speed increase every tick (exponential)
    ball.vx *= BALL_TICK_ACCEL;
    ball.vy *= BALL_TICK_ACCEL;

    ball.x += ball.vx;
    ball.y += ball.vy;

    // Dynamic ball size: starts big, shrinks over time
    const BALL_SIZE = Math.max(BALL_SIZE_MIN, BALL_SIZE_START - this.state_.rallyTicks * 0.00003);

    // Top/bottom bounce
    if (ball.y - BALL_SIZE <= 0) {
      ball.y = BALL_SIZE;
      ball.vy = Math.abs(ball.vy);
    }
    if (ball.y + BALL_SIZE >= 1) {
      ball.y = 1 - BALL_SIZE;
      ball.vy = -Math.abs(ball.vy);
    }

    // Swept collision helper: check if ball crossed paddle during this tick
    const prevBallX = ball.x - ball.vx;
    const prevBallY = ball.y - ball.vy;

    // Left paddle collision
    const lp = paddles.left;
    const lpLeft = lp.x - PADDLE_WIDTH / 2;
    const lpRight = lp.x + PADDLE_WIDTH / 2;
    const lpTop = lp.y - PADDLE_HEIGHT / 2;
    const lpBottom = lp.y + PADDLE_HEIGHT / 2;

    // Check if ball crossed the paddle's x-range during this tick
    const ballEdgeR = ball.x + BALL_SIZE;
    const ballEdgeL = ball.x - BALL_SIZE;
    const prevEdgeR = prevBallX + BALL_SIZE;
    const prevEdgeL = prevBallX - BALL_SIZE;

    // Ball moving left, crossed into paddle from right side
    if (ball.vx < 0 && prevEdgeL >= lpRight && ballEdgeL <= lpRight) {
      // Interpolate Y at crossing point
      const t = (lpRight - (prevBallX - BALL_SIZE)) / (ball.vx);
      const crossY = prevBallY + ball.vy * t;
      if (crossY >= lpTop && crossY <= lpBottom) {
        const hitPos = (crossY - lp.y) / (PADDLE_HEIGHT / 2);
        const angle = hitPos * (Math.PI / 4);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
        ball.x = lpRight + BALL_SIZE;
        ball.y = crossY;
        ball.vx = Math.abs(speed * Math.cos(angle));
        ball.vy = speed * Math.sin(angle);
      }
    }
    // Ball moving right, crossed into paddle from left side
    else if (ball.vx > 0 && prevEdgeR <= lpLeft && ballEdgeR >= lpLeft) {
      const t = (lpLeft - (prevBallX + BALL_SIZE)) / (ball.vx);
      const crossY = prevBallY + ball.vy * t;
      if (crossY >= lpTop && crossY <= lpBottom) {
        const hitPos = (crossY - lp.y) / (PADDLE_HEIGHT / 2);
        const angle = hitPos * (Math.PI / 4);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
        ball.x = lpLeft - BALL_SIZE;
        ball.y = crossY;
        ball.vx = -Math.abs(speed * Math.cos(angle));
        ball.vy = speed * Math.sin(angle);
      }
    }
    // Ball currently overlapping paddle (fallback for slow speeds)
    else if (
      ballEdgeR >= lpLeft && ballEdgeL <= lpRight &&
      ball.y >= lpTop && ball.y <= lpBottom
    ) {
      const hitPos = (ball.y - lp.y) / (PADDLE_HEIGHT / 2);
      const angle = hitPos * (Math.PI / 4);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
      if (ball.x < lp.x) {
        ball.x = lpLeft - BALL_SIZE;
        ball.vx = -Math.abs(speed * Math.cos(angle));
      } else {
        ball.x = lpRight + BALL_SIZE;
        ball.vx = Math.abs(speed * Math.cos(angle));
      }
      ball.vy = speed * Math.sin(angle);
    }

    // Right paddle collision
    const rp = paddles.right;
    const rpLeft = rp.x - PADDLE_WIDTH / 2;
    const rpRight = rp.x + PADDLE_WIDTH / 2;
    const rpTop = rp.y - PADDLE_HEIGHT / 2;
    const rpBottom = rp.y + PADDLE_HEIGHT / 2;

    // Ball moving right, crossed into paddle from left side
    if (ball.vx > 0 && prevEdgeR <= rpLeft && ball.x + BALL_SIZE >= rpLeft) {
      const t = (rpLeft - (prevBallX + BALL_SIZE)) / (ball.vx);
      const crossY = prevBallY + ball.vy * t;
      if (crossY >= rpTop && crossY <= rpBottom) {
        const hitPos = (crossY - rp.y) / (PADDLE_HEIGHT / 2);
        const angle = hitPos * (Math.PI / 4);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
        ball.x = rpLeft - BALL_SIZE;
        ball.y = crossY;
        ball.vx = -Math.abs(speed * Math.cos(angle));
        ball.vy = speed * Math.sin(angle);
      }
    }
    // Ball moving left, crossed into paddle from right side
    else if (ball.vx < 0 && prevEdgeL >= rpRight && ball.x - BALL_SIZE <= rpRight) {
      const t = (rpRight - (prevBallX - BALL_SIZE)) / (ball.vx);
      const crossY = prevBallY + ball.vy * t;
      if (crossY >= rpTop && crossY <= rpBottom) {
        const hitPos = (crossY - rp.y) / (PADDLE_HEIGHT / 2);
        const angle = hitPos * (Math.PI / 4);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
        ball.x = rpRight + BALL_SIZE;
        ball.y = crossY;
        ball.vx = Math.abs(speed * Math.cos(angle));
        ball.vy = speed * Math.sin(angle);
      }
    }
    // Ball currently overlapping paddle (fallback)
    else if (
      ball.x + BALL_SIZE >= rpLeft && ball.x - BALL_SIZE <= rpRight &&
      ball.y >= rpTop && ball.y <= rpBottom
    ) {
      const hitPos = (ball.y - rp.y) / (PADDLE_HEIGHT / 2);
      const angle = hitPos * (Math.PI / 4);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
      if (ball.x > rp.x) {
        ball.x = rpRight + BALL_SIZE;
        ball.vx = Math.abs(speed * Math.cos(angle));
      } else {
        ball.x = rpLeft - BALL_SIZE;
        ball.vx = -Math.abs(speed * Math.cos(angle));
      }
      ball.vy = speed * Math.sin(angle);
    }

    // Paddle-ball push: if paddle moved into ball, push ball with momentum
    const PUSH_FORCE = 1.5; // momentum transfer multiplier
    for (const side of ["left", "right"] as const) {
      const p = paddles[side];
      const prev = this.prevPaddles[side];
      const pLeft = p.x - PADDLE_WIDTH / 2;
      const pRight = p.x + PADDLE_WIDTH / 2;
      const pTop = p.y - PADDLE_HEIGHT / 2;
      const pBottom = p.y + PADDLE_HEIGHT / 2;

      // Check if ball overlaps this paddle
      if (
        ball.x + BALL_SIZE > pLeft &&
        ball.x - BALL_SIZE < pRight &&
        ball.y + BALL_SIZE > pTop &&
        ball.y - BALL_SIZE < pBottom
      ) {
        // Paddle velocity this tick
        const pvx = p.x - prev.x;
        const pvy = p.y - prev.y;

        // Push ball out along the shortest axis
        const overlapLeft = (ball.x + BALL_SIZE) - pLeft;
        const overlapRight = pRight - (ball.x - BALL_SIZE);
        const overlapTop = (ball.y + BALL_SIZE) - pTop;
        const overlapBottom = pBottom - (ball.y - BALL_SIZE);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft) {
          ball.x = pLeft - BALL_SIZE;
        } else if (minOverlap === overlapRight) {
          ball.x = pRight + BALL_SIZE;
        } else if (minOverlap === overlapTop) {
          ball.y = pTop - BALL_SIZE;
        } else {
          ball.y = pBottom + BALL_SIZE;
        }

        // Transfer paddle momentum to ball
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.vx += pvx * PUSH_FORCE;
        ball.vy += pvy * PUSH_FORCE;

        // Maintain minimum speed so ball doesn't stall
        const newSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (newSpeed < speed * 0.5) {
          const scale = (speed * 0.5) / Math.max(newSpeed, 0.001);
          ball.vx *= scale;
          ball.vy *= scale;
        }
      }
    }

    // Store current paddle positions for next tick's momentum calc
    this.prevPaddles = {
      left: { ...paddles.left },
      right: { ...paddles.right },
    };

    // Spawn pickup if timer elapsed
    if (!this.pickup.active && now >= this.nextPickupTime) {
      this.pickup = { x: 0.5, y: 0.2 + Math.random() * 0.6, active: true };
    }

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;

      // Off screen
      if (b.x < -0.05 || b.x > 1.05) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Check hit against opponent paddle
      const target: "left" | "right" = b.owner === "left" ? "right" : "left";
      const targetPaddle = paddles[target];
      const dx = b.x - targetPaddle.x;
      const dy = b.y - targetPaddle.y;
      if (Math.sqrt(dx * dx + dy * dy) < BULLET_HIT_RADIUS) {
        this.slowedUntil[target] = now + SLOW_DURATION;
        this.bullets.splice(i, 1);
        this.broadcast(JSON.stringify({ type: "bullet-hit", target }));
      }
    }

    // Scoring
    if (ball.x < 0) {
      this.state_.score.right++;
      if (this.state_.score.right >= WIN_SCORE) {
        this.winner = this.getNameForRole("right") || "RED";
        this.broadcastState();
        this.scheduleRestart();
        return;
      }
      this.resetBall("right");
    }
    if (ball.x > 1) {
      this.state_.score.left++;
      if (this.state_.score.left >= WIN_SCORE) {
        this.winner = this.getNameForRole("left") || "CYAN";
        this.broadcastState();
        this.scheduleRestart();
        return;
      }
      this.resetBall("left");
    }

    this.broadcastState();
  }

  scheduleRestart() {
    setTimeout(() => {
      this.winner = null;
      this.state_ = this.freshState();
      this.bullets = [];
      this.ammo = { left: 0, right: 0 };
      this.pickup = { x: 0.5, y: 0.5, active: false };
      this.slowedUntil = { left: 0, right: 0 };
      if (this.players.size === 2) {
        this.startGame();
      } else {
        this.stopGame();
        this.broadcastState();
      }
    }, RESTART_DELAY);
  }

  broadcast(msg: string) {
    for (const ws of this.allSockets) {
      try {
        ws.send(msg);
      } catch {
        // socket closed
      }
    }
  }

  broadcastState() {
    const now = Date.now();
    this.broadcast(
      JSON.stringify({
        type: "game-state",
        state: {
          ball: { x: this.state_.ball.x, y: this.state_.ball.y },
          ballSize: Math.max(BALL_SIZE_MIN, BALL_SIZE_START - this.state_.rallyTicks * 0.00003),
          paddles: this.state_.paddles,
          score: this.state_.score,
          names: {
            left: this.getNameForRole("left"),
            right: this.getNameForRole("right"),
          },
          locations: {
            left: this.getLocationForRole("left"),
            right: this.getLocationForRole("right"),
          },
          winner: this.winner,
          bullets: this.bullets.map(b => ({ x: b.x, y: b.y, owner: b.owner })),
          ammo: this.ammo,
          pickup: this.pickup,
          slowed: {
            left: this.slowedUntil.left > now,
            right: this.slowedUntil.right > now,
          },
        },
      })
    );
  }

  broadcastPlayerCount() {
    this.broadcast(
      JSON.stringify({ type: "player-count", count: this.allSockets.size })
    );
  }

  broadcastCursors() {
    const cursorsArr = [...this.cursors.entries()].map(([, data]) => data);
    this.broadcast(JSON.stringify({ type: "cursors", cursors: cursorsArr }));
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.allSockets.add(server);

    const role = this.assignRole(server);
    server.send(JSON.stringify({ type: "role", role }));
    server.send(
      JSON.stringify({
        type: "game-state",
        state: {
          ball: { x: this.state_.ball.x, y: this.state_.ball.y },
          ballSize: Math.max(BALL_SIZE_MIN, BALL_SIZE_START - this.state_.rallyTicks * 0.00003),
          paddles: this.state_.paddles,
          score: this.state_.score,
          names: {
            left: this.getNameForRole("left"),
            right: this.getNameForRole("right"),
          },
          locations: {
            left: this.getLocationForRole("left"),
            right: this.getLocationForRole("right"),
          },
          winner: this.winner,
          bullets: this.bullets.map(b => ({ x: b.x, y: b.y, owner: b.owner })),
          ammo: this.ammo,
          pickup: this.pickup,
          slowed: {
            left: this.slowedUntil.left > Date.now(),
            right: this.slowedUntil.right > Date.now(),
          },
        },
      })
    );

    this.broadcastPlayerCount();

    if (this.players.size === 2 && !this.running && !this.winner) {
      this.startGame();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const data = JSON.parse(message);

    if (data.type === "set-name") {
      this.names.set(ws, String(data.name).slice(0, 12));
      if (data.location) this.locations.set(ws, String(data.location).slice(0, 30));
      this.broadcastState();
      return;
    }

    if (data.type === "cursor-move") {
      const name = this.names.get(ws) ?? "";
      this.cursors.set(ws, { x: data.x, y: data.y, name });
      this.broadcastCursors();
      return;
    }

    const role = this.players.get(ws);
    if (!role) return;

    if (data.type === "paddle-move") {
      const now = Date.now();
      const isSlowed = this.slowedUntil[role] > now;

      let y = data.y;
      let x = data.x;

      // Apply slowdown: lerp toward current position instead of jumping
      if (isSlowed) {
        const current = this.state_.paddles[role];
        x = current.x + (x - current.x) * SLOW_FACTOR;
        y = current.y + (y - current.y) * SLOW_FACTOR;
      }

      y = Math.max(PADDLE_HEIGHT / 2, Math.min(1 - PADDLE_HEIGHT / 2, y));

      if (role === "left") {
        x = Math.max(LEFT_X_MIN, Math.min(LEFT_X_MAX, x ?? 0.04));
      } else {
        x = Math.max(RIGHT_X_MIN, Math.min(RIGHT_X_MAX, x ?? 0.96));
      }

      this.state_.paddles[role] = { x, y };
      this.cursorPositions[role] = { x: data.x, y: data.y };

      if (!this.running) {
        this.broadcastState();
      }
    }

    if (data.type === "grab-pickup") {
      if (this.pickup.active) {
        // Check if paddle is close enough to pickup (more lenient)
        const paddle = this.state_.paddles[role];
        const dx = paddle.x - this.pickup.x;
        const dy = paddle.y - this.pickup.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.2) {
          this.pickup.active = false;
          this.ammo[role] += 3;
          this.nextPickupTime = Date.now() + PICKUP_SPAWN_INTERVAL;
          this.broadcastState();
        }
      }
    }

    if (data.type === "fire-bullet") {
      if (this.ammo[role] > 0 && this.running) {
        this.ammo[role]--;
        const paddle = this.state_.paddles[role];
        const vx = role === "left" ? BULLET_SPEED : -BULLET_SPEED;
        this.bullets.push({ x: paddle.x, y: paddle.y, vx, owner: role });
      }
    }
  }

  webSocketClose(ws: WebSocket) {
    const role = this.players.get(ws);
    this.players.delete(ws);
    this.names.delete(ws);
    this.locations.delete(ws);
    this.spectators.delete(ws);
    this.allSockets.delete(ws);
    this.cursors.delete(ws);

    if (role) {
      const next = [...this.spectators][0];
      if (next) {
        this.spectators.delete(next);
        this.players.set(next, role);
        next.send(JSON.stringify({ type: "role", role }));
      } else {
        this.stopGame();
      }
    }

    this.broadcastPlayerCount();
    this.broadcastCursors();
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }
}

export interface Env {
  PONG_ROOM: DurableObjectNamespace<PongRoom>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Upgrade",
        },
      });
    }

    if (url.pathname === "/ws" || url.pathname === "/") {
      const id = env.PONG_ROOM.idFromName("main");
      const room = env.PONG_ROOM.get(id);
      return room.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
