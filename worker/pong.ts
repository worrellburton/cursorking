import { DurableObject } from "cloudflare:workers";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 12;
const PADDLE_OFFSET = 20;
const BALL_SIZE = 10;
const BALL_SPEED = 5;

type GameState = {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { left: number; right: number };
  score: { left: number; right: number };
};

export class PongRoom extends DurableObject {
  players: Map<WebSocket, "left" | "right"> = new Map();
  spectators: Set<WebSocket> = new Set();
  allSockets: Set<WebSocket> = new Set();
  state_: GameState;
  interval: ReturnType<typeof setInterval> | null = null;
  running = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.state_ = this.freshState();
  }

  freshState(): GameState {
    const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      ball: {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        vx: BALL_SPEED * dir * Math.cos(angle),
        vy: BALL_SPEED * Math.sin(angle),
      },
      paddles: { left: CANVAS_HEIGHT / 2, right: CANVAS_HEIGHT / 2 },
      score: { left: 0, right: 0 },
    };
  }

  resetBall(scoredSide: "left" | "right") {
    const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;
    const dir = scoredSide === "left" ? -1 : 1;
    this.state_.ball = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      vx: BALL_SPEED * dir * Math.cos(angle),
      vy: BALL_SPEED * Math.sin(angle),
    };
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
    this.running = true;
    this.state_ = { ...this.freshState(), score: this.state_.score };
    this.interval = setInterval(() => this.tick(), 1000 / 60);
  }

  stopGame() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick() {
    const { ball, paddles } = this.state_;

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - BALL_SIZE <= 0) {
      ball.y = BALL_SIZE;
      ball.vy = Math.abs(ball.vy);
    }
    if (ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
      ball.y = CANVAS_HEIGHT - BALL_SIZE;
      ball.vy = -Math.abs(ball.vy);
    }

    const leftPaddleX = PADDLE_OFFSET + PADDLE_WIDTH;
    if (
      ball.x - BALL_SIZE <= leftPaddleX &&
      ball.x - BALL_SIZE >= PADDLE_OFFSET &&
      ball.y >= paddles.left - PADDLE_HEIGHT / 2 &&
      ball.y <= paddles.left + PADDLE_HEIGHT / 2
    ) {
      ball.x = leftPaddleX + BALL_SIZE;
      const hitPos = (ball.y - paddles.left) / (PADDLE_HEIGHT / 2);
      const angle = hitPos * (Math.PI / 4);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) + 0.2;
      ball.vx = Math.abs(speed * Math.cos(angle));
      ball.vy = speed * Math.sin(angle);
    }

    const rightPaddleX = CANVAS_WIDTH - PADDLE_OFFSET - PADDLE_WIDTH;
    if (
      ball.x + BALL_SIZE >= rightPaddleX &&
      ball.x + BALL_SIZE <= CANVAS_WIDTH - PADDLE_OFFSET &&
      ball.y >= paddles.right - PADDLE_HEIGHT / 2 &&
      ball.y <= paddles.right + PADDLE_HEIGHT / 2
    ) {
      ball.x = rightPaddleX - BALL_SIZE;
      const hitPos = (ball.y - paddles.right) / (PADDLE_HEIGHT / 2);
      const angle = hitPos * (Math.PI / 4);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) + 0.2;
      ball.vx = -Math.abs(speed * Math.cos(angle));
      ball.vy = speed * Math.sin(angle);
    }

    if (ball.x < 0) {
      this.state_.score.right++;
      this.resetBall("right");
    }
    if (ball.x > CANVAS_WIDTH) {
      this.state_.score.left++;
      this.resetBall("left");
    }

    this.broadcastState();
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
        },
      })
    );
  }

  broadcastPlayerCount() {
    this.broadcast(
      JSON.stringify({ type: "player-count", count: this.allSockets.size })
    );
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
        },
      })
    );

    this.broadcastPlayerCount();

    if (this.players.size === 2 && !this.running) {
      this.startGame();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const data = JSON.parse(message);
    const role = this.players.get(ws);
    if (!role) return;

    if (data.type === "paddle-move") {
      const y = Math.max(
        PADDLE_HEIGHT / 2,
        Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, data.y)
      );
      this.state_.paddles[role] = y;
    }
  }

  webSocketClose(ws: WebSocket) {
    const role = this.players.get(ws);
    this.players.delete(ws);
    this.spectators.delete(ws);
    this.allSockets.delete(ws);

    if (role) {
      // Promote a spectator
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

    // CORS headers for cross-origin WebSocket from GitHub Pages
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
