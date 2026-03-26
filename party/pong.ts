import type * as Party from "partykit/server";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_OFFSET = 20;
const BALL_SIZE = 10;
const BALL_SPEED = 5;
const TICK_RATE = 1000 / 60; // 60fps

type GameState = {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { left: number; right: number };
  score: { left: number; right: number };
};

export default class PongServer implements Party.Server {
  players: Map<string, "left" | "right"> = new Map();
  spectators: Set<string> = new Set();
  state: GameState;
  interval: ReturnType<typeof setInterval> | null = null;
  running = false;

  constructor(readonly room: Party.Room) {
    this.state = this.freshState();
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
    this.state.ball = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      vx: BALL_SPEED * dir * Math.cos(angle),
      vy: BALL_SPEED * Math.sin(angle),
    };
  }

  assignRole(connId: string): "left" | "right" | "spectator" {
    const hasLeft = [...this.players.values()].includes("left");
    const hasRight = [...this.players.values()].includes("right");

    if (!hasLeft) {
      this.players.set(connId, "left");
      return "left";
    }
    if (!hasRight) {
      this.players.set(connId, "right");
      return "right";
    }
    this.spectators.add(connId);
    return "spectator";
  }

  startGame() {
    if (this.running) return;
    this.running = true;
    this.state = { ...this.freshState(), score: this.state.score };
    this.interval = setInterval(() => this.tick(), TICK_RATE);
  }

  stopGame() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick() {
    const { ball, paddles } = this.state;

    // Move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Top/bottom wall bounce
    if (ball.y - BALL_SIZE <= 0) {
      ball.y = BALL_SIZE;
      ball.vy = Math.abs(ball.vy);
    }
    if (ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
      ball.y = CANVAS_HEIGHT - BALL_SIZE;
      ball.vy = -Math.abs(ball.vy);
    }

    // Left paddle collision
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

    // Right paddle collision
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

    // Scoring
    if (ball.x < 0) {
      this.state.score.right++;
      this.resetBall("right");
    }
    if (ball.x > CANVAS_WIDTH) {
      this.state.score.left++;
      this.resetBall("left");
    }

    this.broadcastState();
  }

  broadcastState() {
    const msg = JSON.stringify({
      type: "game-state",
      state: {
        ball: { x: this.state.ball.x, y: this.state.ball.y },
        paddles: this.state.paddles,
        score: this.state.score,
        players: {
          left: [...this.players.entries()].find(([, r]) => r === "left")?.[0] ?? null,
          right: [...this.players.entries()].find(([, r]) => r === "right")?.[0] ?? null,
        },
      },
    });
    this.room.broadcast(msg);
  }

  broadcastPlayerCount() {
    const count = this.players.size + this.spectators.size;
    this.room.broadcast(JSON.stringify({ type: "player-count", count }));
  }

  onConnect(conn: Party.Connection) {
    const role = this.assignRole(conn.id);
    conn.send(JSON.stringify({ type: "role", role }));
    conn.send(
      JSON.stringify({
        type: "game-state",
        state: {
          ball: { x: this.state.ball.x, y: this.state.ball.y },
          paddles: this.state.paddles,
          score: this.state.score,
          players: {
            left: [...this.players.entries()].find(([, r]) => r === "left")?.[0] ?? null,
            right: [...this.players.entries()].find(([, r]) => r === "right")?.[0] ?? null,
          },
        },
      })
    );

    this.broadcastPlayerCount();

    // Start game when 2 players are in
    if (this.players.size === 2 && !this.running) {
      this.startGame();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message);
    const role = this.players.get(sender.id);
    if (!role) return;

    if (data.type === "paddle-move") {
      const y = Math.max(
        PADDLE_HEIGHT / 2,
        Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, data.y)
      );
      this.state.paddles[role] = y;
    }
  }

  onClose(conn: Party.Connection) {
    const role = this.players.get(conn.id);
    this.players.delete(conn.id);
    this.spectators.delete(conn.id);

    // Promote a spectator if a player left
    if (role) {
      const nextSpectator = [...this.spectators.values()][0];
      if (nextSpectator) {
        this.spectators.delete(nextSpectator);
        this.players.set(nextSpectator, role);
        // Notify the promoted spectator
        for (const c of this.room.getConnections()) {
          if (c.id === nextSpectator) {
            c.send(JSON.stringify({ type: "role", role }));
          }
        }
      } else {
        // Not enough players, stop game
        this.stopGame();
      }
    }

    this.broadcastPlayerCount();
  }
}

PongServer satisfies Party.Worker;
