import { DurableObject } from "cloudflare:workers";

// ==================== TYPES ====================

type Team = "top" | "bottom";
type Role = "king" | "sniper" | "orb" | "healer" | "gunner";
type Phase = "lobby" | "countdown" | "playing" | "over";

const ROLES: Role[] = ["king", "sniper", "orb", "healer", "gunner"];

// ==================== CONSTANTS ====================

const TICK_RATE = 60;
const COUNTDOWN_SECS = 5;

// Movement: units per tick (normalized 0–1 coords)
const MOVE_SPEED: Record<Role, number> = {
  king: 0.004,
  sniper: 0.004,
  orb: 0, // uses lerp instead
  healer: 0.004,
  gunner: 0.006,
};
const ORB_LERP = 0.03;

const MAX_HP: Record<Role, number> = {
  king: 100,
  sniper: 100,
  orb: 1000,
  healer: 100,
  gunner: 100,
};

const PLAYER_RADIUS: Record<Role, number> = {
  king: 0.02,
  sniper: 0.015,
  orb: 0.04,
  healer: 0.015,
  gunner: 0.015,
};

// Bullet config
const BULLET_SPEED: Record<string, number> = {
  king: 0.008,
  sniper: 0.012,
  gunner: 0.015,
};
const BULLET_RADIUS = 0.005;
const SNIPER_MAX_BOUNCES = 5;

// Damage
const DMG_KING = 15;
const DMG_KING_TO_ORB = 150; // 10x
const DMG_SNIPER_MIN = 20;
const DMG_SNIPER_MAX = 100; // instant kill
const DMG_SNIPER_TO_ORB_FACTOR = 2.5; // 25% of 1000 at full charge
const DMG_SNIPER_SUPER = 150;
const DMG_SNIPER_SUPER_TO_ORB = 500;
const DMG_GUNNER = 10;

// Cooldowns (ms)
const KING_SHOT_CD = 5000;
const SNIPER_CHARGE_TIME = 3000;
const GUNNER_FIRE_RATE = 100; // ms between shots
const GUNNER_EMPOWERED_RATE = 50;
const HEAL_PER_TICK = 20 / TICK_RATE; // 20 hp/sec
const EMPOWER_DURATION = 5000;
const EMPOWER_COOLDOWN = 10000;
const ORB_EMPOWER_GROWTH = 0.015;

// Spawn positions
const SPAWN_X = [0.15, 0.3, 0.5, 0.7, 0.85];
const SPAWN_Y: Record<Team, number> = { top: 0.15, bottom: 0.85 };

// ==================== STATE TYPES ====================

interface Player {
  id: string;
  name: string;
  team: Team;
  role: Role;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  // Input
  targetX: number;
  targetY: number;
  mouseDown: boolean;   // left click held
  rightDown: boolean;   // right click held
  // Combat
  lastShot: number;
  charging: boolean;
  chargeStart: number;
  // Status
  empowered: boolean;
  empowerEnd: number;
  hasSuperBullet: boolean;
  // Healer-specific
  empowerCdEnd: number;
  // Orb-specific
  orbSize: number;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  team: Team;
  sourceRole: Role;
  damage: number;
  damageToOrb: number;
  bounces: number;
  maxBounces: number;
  isSuper: boolean;
  penetrating: boolean;
  hitIds: string[];
}

interface Slot {
  team: Team;
  role: Role;
  playerId: string | null;
  playerName: string;
}

// ==================== WAR ROOM ====================

export class WarRoom extends DurableObject {
  sockets = new Map<string, WebSocket>();
  names = new Map<string, string>();
  phase: Phase = "lobby";
  players = new Map<string, Player>();
  bullets: Bullet[] = [];
  slots: Slot[] = [];
  interval: ReturnType<typeof setInterval> | null = null;
  nextBulletId = 0;
  winner: Team | null = null;
  countdownValue = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as Record<string, unknown>);
    this.initSlots();
  }

  initSlots() {
    this.slots = [];
    for (const team of ["top", "bottom"] as Team[]) {
      for (const role of ROLES) {
        this.slots.push({ team, role, playerId: null, playerName: "" });
      }
    }
  }

  genId(): string {
    return "p" + Math.random().toString(36).slice(2, 8);
  }

  // ---- Lobby ----

  selectSlot(playerId: string, team: Team, role: Role) {
    if (this.phase !== "lobby") return;

    // Remove player from any current slot
    for (const s of this.slots) {
      if (s.playerId === playerId) {
        s.playerId = null;
        s.playerName = "";
      }
    }

    // Claim the slot if available
    const slot = this.slots.find(s => s.team === team && s.role === role);
    if (slot && !slot.playerId) {
      slot.playerId = playerId;
      slot.playerName = this.names.get(playerId) ?? "";
    }

    this.broadcastLobby();

    // Check if all 10 slots filled
    if (this.slots.every(s => s.playerId !== null)) {
      this.startCountdown();
    }
  }

  startCountdown() {
    this.phase = "countdown";
    this.countdownValue = COUNTDOWN_SECS;
    this.broadcastLobby();

    const tick = () => {
      this.countdownValue--;
      if (this.countdownValue <= 0) {
        this.startGame();
      } else {
        this.broadcast(JSON.stringify({ type: "war-countdown", value: this.countdownValue }));
        setTimeout(tick, 1000);
      }
    };
    setTimeout(tick, 1000);
  }

  // ---- Game start ----

  startGame() {
    this.phase = "playing";
    this.bullets = [];
    this.winner = null;
    this.players.clear();

    const roleIndex: Record<Role, number> = { king: 2, sniper: 1, orb: 0, healer: 3, gunner: 4 };

    for (const slot of this.slots) {
      if (!slot.playerId) continue;
      const spawnIdx = roleIndex[slot.role];
      const p: Player = {
        id: slot.playerId,
        name: slot.playerName,
        team: slot.team,
        role: slot.role,
        x: SPAWN_X[spawnIdx],
        y: SPAWN_Y[slot.team],
        hp: MAX_HP[slot.role],
        alive: true,
        targetX: SPAWN_X[spawnIdx],
        targetY: SPAWN_Y[slot.team],
        mouseDown: false,
        rightDown: false,
        lastShot: 0,
        charging: false,
        chargeStart: 0,
        empowered: false,
        empowerEnd: 0,
        hasSuperBullet: false,
        empowerCdEnd: 0,
        orbSize: PLAYER_RADIUS.orb,
      };
      this.players.set(slot.playerId, p);
    }

    this.broadcast(JSON.stringify({ type: "war-start" }));
    this.interval = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stopGame() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // ---- Tick ----

  tick() {
    if (this.phase !== "playing") return;
    const now = Date.now();

    // 1. Move players
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.movePlayer(p);
    }

    // 2. Handle role abilities
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.handleAbilities(p, now);
    }

    // 3. Move bullets and check collisions
    this.updateBullets();

    // 4. Check win condition
    this.checkWin();

    // 5. Broadcast
    this.broadcastState();
  }

  movePlayer(p: Player) {
    if (p.role === "orb") {
      // Orb lerps toward target
      const lerpFactor = p.empowered ? ORB_LERP * 0.7 : ORB_LERP;
      p.x += (p.targetX - p.x) * lerpFactor;
      p.y += (p.targetY - p.y) * lerpFactor;
    } else {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = MOVE_SPEED[p.role];
      if (dist > speed) {
        p.x += (dx / dist) * speed;
        p.y += (dy / dist) * speed;
      } else {
        p.x = p.targetX;
        p.y = p.targetY;
      }
    }
    // Clamp to bounds
    const r = p.role === "orb" ? p.orbSize : PLAYER_RADIUS[p.role];
    p.x = Math.max(r, Math.min(1 - r, p.x));
    p.y = Math.max(r, Math.min(1 - r, p.y));
  }

  handleAbilities(p: Player, now: number) {
    // Check empower expiry
    if (p.empowered && now >= p.empowerEnd) {
      p.empowered = false;
      if (p.role === "orb") {
        p.orbSize = PLAYER_RADIUS.orb; // reset size
      }
    }

    switch (p.role) {
      case "king":
        this.handleKing(p, now);
        break;
      case "sniper":
        this.handleSniper(p, now);
        break;
      case "gunner":
        this.handleGunner(p, now);
        break;
      case "healer":
        this.handleHealer(p, now);
        break;
      // orb has no abilities
    }
  }

  handleKing(p: Player, now: number) {
    if (p.mouseDown && now - p.lastShot >= (p.empowered ? 0 : KING_SHOT_CD)) {
      // Fire toward cursor
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        const speed = BULLET_SPEED.king;
        this.bullets.push({
          id: this.nextBulletId++,
          x: p.x,
          y: p.y,
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed,
          ownerId: p.id,
          team: p.team,
          sourceRole: "king",
          damage: DMG_KING,
          damageToOrb: DMG_KING_TO_ORB,
          bounces: 0,
          maxBounces: 0,
          isSuper: false,
          penetrating: false,
          hitIds: [],
        });
        p.lastShot = now;
        p.mouseDown = false; // single shot per click
      }
    }
  }

  handleSniper(p: Player, now: number) {
    // Start charging on mouseDown
    if (p.mouseDown && !p.charging) {
      p.charging = true;
      p.chargeStart = now;
    }
    // Release: fire
    if (!p.mouseDown && p.charging) {
      p.charging = false;
      const chargeTime = Math.min(now - p.chargeStart, SNIPER_CHARGE_TIME);
      const chargeRatio = chargeTime / SNIPER_CHARGE_TIME;

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        const speed = BULLET_SPEED.sniper;
        const isSuper = p.hasSuperBullet;

        let damage: number;
        let damageToOrb: number;
        if (isSuper) {
          damage = DMG_SNIPER_SUPER;
          damageToOrb = DMG_SNIPER_SUPER_TO_ORB;
          p.hasSuperBullet = false;
        } else {
          damage = DMG_SNIPER_MIN + (DMG_SNIPER_MAX - DMG_SNIPER_MIN) * chargeRatio;
          damageToOrb = damage * DMG_SNIPER_TO_ORB_FACTOR;
        }

        this.bullets.push({
          id: this.nextBulletId++,
          x: p.x,
          y: p.y,
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed,
          ownerId: p.id,
          team: p.team,
          sourceRole: "sniper",
          damage,
          damageToOrb,
          bounces: 0,
          maxBounces: SNIPER_MAX_BOUNCES,
          isSuper,
          penetrating: isSuper,
          hitIds: [],
        });
      }
    }
  }

  handleGunner(p: Player, now: number) {
    if (!p.mouseDown) return;
    const rate = p.empowered ? GUNNER_EMPOWERED_RATE : GUNNER_FIRE_RATE;
    if (now - p.lastShot < rate) return;

    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.01) {
      const speed = BULLET_SPEED.gunner;
      // Add small spread
      const spread = (Math.random() - 0.5) * 0.08;
      const angle = Math.atan2(dy, dx) + spread;
      this.bullets.push({
        id: this.nextBulletId++,
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ownerId: p.id,
        team: p.team,
        sourceRole: "gunner",
        damage: DMG_GUNNER,
        damageToOrb: DMG_GUNNER,
        bounces: 0,
        maxBounces: 0,
        isSuper: false,
        penetrating: false,
        hitIds: [],
      });
      p.lastShot = now;
    }
  }

  handleHealer(p: Player, now: number) {
    // Find closest alive ally (not self)
    const closest = this.findClosestAlly(p);
    if (!closest) return;

    // Left click: heal
    if (p.mouseDown && closest.hp < MAX_HP[closest.role]) {
      closest.hp = Math.min(MAX_HP[closest.role], closest.hp + HEAL_PER_TICK);
    }

    // Right click: empower
    if (p.rightDown && now >= p.empowerCdEnd) {
      this.empowerTarget(closest, now);
      p.empowerCdEnd = now + EMPOWER_COOLDOWN;
      p.rightDown = false; // single activation per click
    }
  }

  findClosestAlly(p: Player): Player | null {
    let best: Player | null = null;
    let bestDist = Infinity;
    for (const other of this.players.values()) {
      if (other.id === p.id || other.team !== p.team || !other.alive) continue;
      const dx = other.x - p.x;
      const dy = other.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  empowerTarget(target: Player, now: number) {
    target.empowered = true;
    target.empowerEnd = now + EMPOWER_DURATION;

    switch (target.role) {
      case "king":
        target.lastShot = 0; // instant recharge
        break;
      case "orb":
        target.orbSize = PLAYER_RADIUS.orb + ORB_EMPOWER_GROWTH;
        break;
      case "sniper":
        target.hasSuperBullet = true;
        break;
      // gunner: empowered flag makes fire rate faster (handled in handleGunner)
    }
  }

  // ---- Bullets ----

  updateBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;
      b.y += b.vy;

      // Wall bouncing (for sniper)
      if (b.maxBounces > 0) {
        if (b.x <= 0 || b.x >= 1) {
          b.vx = -b.vx;
          b.x = Math.max(0, Math.min(1, b.x));
          b.bounces++;
        }
        if (b.y <= 0 || b.y >= 1) {
          b.vy = -b.vy;
          b.y = Math.max(0, Math.min(1, b.y));
          b.bounces++;
        }
        if (b.bounces > b.maxBounces) {
          this.bullets.splice(i, 1);
          continue;
        }
      } else {
        // Non-bouncing bullets die off screen
        if (b.x < -0.05 || b.x > 1.05 || b.y < -0.05 || b.y > 1.05) {
          this.bullets.splice(i, 1);
          continue;
        }
      }

      // Check collision with enemy players
      let removed = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.team === b.team) continue;
        if (b.hitIds.includes(p.id)) continue;

        const r = p.role === "orb" ? p.orbSize : PLAYER_RADIUS[p.role];
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < r + BULLET_RADIUS) {
          // Hit!
          const dmg = p.role === "orb" ? b.damageToOrb : b.damage;
          p.hp -= dmg;
          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
            this.broadcast(JSON.stringify({
              type: "war-kill",
              killerId: b.ownerId,
              victimId: p.id,
              victimRole: p.role,
              victimTeam: p.team,
            }));
          }

          if (b.penetrating) {
            b.hitIds.push(p.id);
          } else {
            this.bullets.splice(i, 1);
            removed = true;
            break;
          }
        }
      }

      // Also check if Orb blocks bullets for allies behind it
      // (Orb absorbs damage — bullets hitting the orb don't pass through)
      // This is already handled above since we check orb collision first
      if (removed) continue;
    }
  }

  checkWin() {
    for (const team of ["top", "bottom"] as Team[]) {
      const king = [...this.players.values()].find(
        p => p.team === team && p.role === "king"
      );
      if (king && !king.alive) {
        this.winner = team === "top" ? "bottom" : "top";
        this.phase = "over";
        this.stopGame();
        this.broadcastState();
        this.broadcast(JSON.stringify({
          type: "war-over",
          winner: this.winner,
        }));

        // Reset to lobby after delay
        setTimeout(() => {
          this.phase = "lobby";
          this.players.clear();
          this.bullets = [];
          this.winner = null;
          this.initSlots();
          // Re-assign connected players back to lobby
          this.broadcastLobby();
        }, 8000);
        return;
      }
    }
  }

  // ---- Broadcast ----

  broadcast(msg: string) {
    for (const ws of this.sockets.values()) {
      try { ws.send(msg); } catch { /* closed */ }
    }
  }

  broadcastLobby() {
    this.broadcast(JSON.stringify({
      type: "war-lobby",
      phase: this.phase,
      slots: this.slots.map(s => ({
        team: s.team,
        role: s.role,
        taken: s.playerId !== null,
        playerName: s.playerName,
      })),
      playerCount: this.sockets.size,
      countdown: this.phase === "countdown" ? this.countdownValue : null,
    }));
  }

  broadcastState() {
    const healBeams: { fromId: string; toId: string }[] = [];
    for (const p of this.players.values()) {
      if (p.role === "healer" && p.alive && p.mouseDown) {
        const target = this.findClosestAlly(p);
        if (target) healBeams.push({ fromId: p.id, toId: target.id });
      }
    }

    const playersArr = [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      role: p.role,
      x: p.x,
      y: p.y,
      hp: p.hp,
      maxHp: MAX_HP[p.role],
      alive: p.alive,
      charging: p.role === "sniper" && p.charging
        ? Math.min(1, (Date.now() - p.chargeStart) / SNIPER_CHARGE_TIME)
        : 0,
      orbSize: p.role === "orb" ? p.orbSize : 0,
      empowered: p.empowered,
      radius: p.role === "orb" ? p.orbSize : PLAYER_RADIUS[p.role],
    }));

    const bulletsArr = this.bullets.map(b => ({
      id: b.id,
      x: b.x,
      y: b.y,
      team: b.team,
      sourceRole: b.sourceRole,
      isSuper: b.isSuper,
    }));

    this.broadcast(JSON.stringify({
      type: "war-state",
      players: playersArr,
      bullets: bulletsArr,
      healBeams,
      winner: this.winner,
    }));
  }

  // ---- WebSocket handlers ----

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const id = this.genId();
    this.sockets.set(id, server);

    server.send(JSON.stringify({ type: "war-welcome", id }));

    if (this.phase === "lobby" || this.phase === "countdown") {
      this.broadcastLobby();
    } else if (this.phase === "playing") {
      // Late join: spectator only
      server.send(JSON.stringify({ type: "war-spectator" }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const data = JSON.parse(message);

    // Find player ID for this socket
    let senderId = "";
    for (const [id, sock] of this.sockets) {
      if (sock === ws) { senderId = id; break; }
    }
    if (!senderId) return;

    if (data.type === "set-name") {
      this.names.set(senderId, String(data.name).slice(0, 12));
      return;
    }

    if (data.type === "select-slot" && this.phase === "lobby") {
      this.selectSlot(senderId, data.team, data.role);
      return;
    }

    if (data.type === "cursor-move") {
      const player = this.players.get(senderId);
      if (player && player.alive) {
        player.targetX = Math.max(0, Math.min(1, data.x));
        player.targetY = Math.max(0, Math.min(1, data.y));
      }
      return;
    }

    if (data.type === "mouse-down") {
      const player = this.players.get(senderId);
      if (!player || !player.alive) return;
      if (data.button === 0) player.mouseDown = true;
      if (data.button === 2) player.rightDown = true;
      return;
    }

    if (data.type === "mouse-up") {
      const player = this.players.get(senderId);
      if (!player || !player.alive) return;
      if (data.button === 0) player.mouseDown = false;
      if (data.button === 2) player.rightDown = false;
      return;
    }
  }

  webSocketClose(ws: WebSocket) {
    let disconnectedId = "";
    for (const [id, sock] of this.sockets) {
      if (sock === ws) {
        disconnectedId = id;
        this.sockets.delete(id);
        this.names.delete(id);
        break;
      }
    }

    if (!disconnectedId) return;

    // Remove from lobby slots
    for (const s of this.slots) {
      if (s.playerId === disconnectedId) {
        s.playerId = null;
        s.playerName = "";
      }
    }

    // If in game, kill the player
    const player = this.players.get(disconnectedId);
    if (player) {
      player.alive = false;
      player.hp = 0;
    }

    if (this.phase === "lobby" || this.phase === "countdown") {
      // Cancel countdown if someone leaves
      if (this.phase === "countdown") {
        this.phase = "lobby";
      }
      this.broadcastLobby();
    } else if (this.phase === "playing") {
      this.checkWin();
    }
  }

  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws);
  }
}
