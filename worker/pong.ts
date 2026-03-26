import { DurableObject } from "cloudflare:workers";

const PADDLE_HEIGHT = 0.14;
const BALL_SIZE = 0.009;
const BALL_SPEED = 0.007;
const BALL_ACCEL = 1.02; // 2% faster each hit
const WIN_SCORE = 3;
const RESTART_DELAY = 3000;

type GameState = {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { left: number; right: number };
  score: { left: number; right: number };
};

export class PongRoom extends DurableObject {
  players: Map<WebSocket, "left" | "right"> = new Map();
  names: Map<WebSocket, string> = new Map();
  spectators: Set<WebSocket> = new Set();
  allSockets: Set<WebSocket> = new Set();
  // Track cursor positions for lobby display
  cursors: Map<WebSocket, { x: number; y: number; name: string }> = new Map();
  state_: GameState;
  interval: ReturnType<typeof setInterval> | null = null;
  running = false;
  winner: string | null = null;

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
      paddles: { left: 0.5, right: 0.5 },
      score: { left: 0, right: 0 },
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
  }

  getNameForRole(role: "left" | "right"): string {
    for (const [ws, r] of this.players) {
      if (r === role) return this.names.get(ws) ?? "";
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
    this.state_ = { ...this.freshState(), score: { left: 0, right: 0 } };
    this.broadcastState();

    // 3-2-1 countdown
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

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - BALL_SIZE <= 0) {
      ball.y = BALL_SIZE;
      ball.vy = Math.abs(ball.vy);
    }
    if (ball.y + BALL_SIZE >= 1) {
      ball.y = 1 - BALL_SIZE;
      ball.vy = -Math.abs(ball.vy);
    }

    const leftPaddleX = 0.04 + 0.018;
    if (
      ball.x - BALL_SIZE <= leftPaddleX &&
      ball.x - BALL_SIZE >= 0.04 &&
      ball.y >= paddles.left - PADDLE_HEIGHT / 2 &&
      ball.y <= paddles.left + PADDLE_HEIGHT / 2
    ) {
      ball.x = leftPaddleX + BALL_SIZE;
      const hitPos = (ball.y - paddles.left) / (PADDLE_HEIGHT / 2);
      const angle = hitPos * (Math.PI / 4);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
      ball.vx = Math.abs(speed * Math.cos(angle));
      ball.vy = speed * Math.sin(angle);
    }

    const rightPaddleX = 1 - 0.04 - 0.018;
    if (
      ball.x + BALL_SIZE >= rightPaddleX &&
      ball.x + BALL_SIZE <= 1 - 0.04 &&
      ball.y >= paddles.right - PADDLE_HEIGHT / 2 &&
      ball.y <= paddles.right + PADDLE_HEIGHT / 2
    ) {
      ball.x = rightPaddleX - BALL_SIZE;
      const hitPos = (ball.y - paddles.right) / (PADDLE_HEIGHT / 2);
      const angle = hitPos * (Math.PI / 4);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * BALL_ACCEL;
      ball.vx = -Math.abs(speed * Math.cos(angle));
      ball.vy = speed * Math.sin(angle);
    }

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
    this.broadcast(
      JSON.stringify({
        type: "game-state",
        state: {
          ball: { x: this.state_.ball.x, y: this.state_.ball.y },
          paddles: this.state_.paddles,
          score: this.state_.score,
          names: {
            left: this.getNameForRole("left"),
            right: this.getNameForRole("right"),
          },
          winner: this.winner,
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
          paddles: this.state_.paddles,
          score: this.state_.score,
          names: {
            left: this.getNameForRole("left"),
            right: this.getNameForRole("right"),
          },
          winner: this.winner,
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
      const y = Math.max(
        PADDLE_HEIGHT / 2,
        Math.min(1 - PADDLE_HEIGHT / 2, data.y)
      );
      this.state_.paddles[role] = y;

      if (!this.running) {
        this.broadcastState();
      }
    }
  }

  webSocketClose(ws: WebSocket) {
    const role = this.players.get(ws);
    this.players.delete(ws);
    this.names.delete(ws);
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
