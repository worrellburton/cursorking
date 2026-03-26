import type * as Party from "partykit/server";

type CursorPosition = {
  x: number;
  y: number;
  pointer: "mouse" | "touch";
};

type CursorMessage =
  | { type: "update"; position: CursorPosition }
  | { type: "remove" };

type BroadcastMessage =
  | { type: "update"; id: string; position: CursorPosition; color: string }
  | { type: "remove"; id: string }
  | { type: "sync"; cursors: Record<string, { position: CursorPosition; color: string }> };

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6",
  "#a855f7", "#6366f1", "#0ea5e9", "#84cc16", "#d946ef",
];

function getColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default class CursorServer implements Party.Server {
  cursors: Map<string, { position: CursorPosition; color: string }> = new Map();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    const cursorsObj: Record<string, { position: CursorPosition; color: string }> = {};
    for (const [id, data] of this.cursors) {
      cursorsObj[id] = data;
    }
    const syncMsg: BroadcastMessage = { type: "sync", cursors: cursorsObj };
    conn.send(JSON.stringify(syncMsg));
  }

  onMessage(message: string, sender: Party.Connection) {
    const data: CursorMessage = JSON.parse(message);

    if (data.type === "update") {
      const color = getColor(sender.id);
      this.cursors.set(sender.id, { position: data.position, color });

      const broadcast: BroadcastMessage = {
        type: "update",
        id: sender.id,
        position: data.position,
        color,
      };
      this.room.broadcast(JSON.stringify(broadcast), [sender.id]);
    }

    if (data.type === "remove") {
      this.cursors.delete(sender.id);
      const broadcast: BroadcastMessage = { type: "remove", id: sender.id };
      this.room.broadcast(JSON.stringify(broadcast), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    this.cursors.delete(conn.id);
    const broadcast: BroadcastMessage = { type: "remove", id: conn.id };
    this.room.broadcast(JSON.stringify(broadcast));
  }
}

CursorServer satisfies Party.Worker;
