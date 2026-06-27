// Minimal ambient declarations for the untyped Steam libraries.
// These cover only the surface this library actually touches, kept deliberately
// small so the typecheck stays honest rather than pretending full coverage.

declare module "steam-user" {
  import { EventEmitter } from "node:events";
  interface LogOnDetails {
    refreshToken?: string;
    accountName?: string;
    password?: string;
  }
  class SteamUser extends EventEmitter {
    logOn(details: LogOnDetails): void;
    logOff(): void;
    gamesPlayed(apps: number[] | number): void;
    setPersona(state: number): void;
    steamID: { getSteamID64(): string } | null;
    on(event: "loggedOn", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "disconnected", listener: (eresult: number, msg?: string) => void): this;
    on(event: "refreshToken", listener: (token: string) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  export = SteamUser;
}

declare module "globaloffensive" {
  import { EventEmitter } from "node:events";

  /** Raw GC item shape. Fields are a subset; unknown extras are tolerated. */
  interface GcItem {
    id: string;
    def_index: number;
    paint_index?: number;
    paint_seed?: number;
    paint_wear?: number;
    rarity?: number;
    quality?: number;
    casket_id?: string;
    casket_contained_item_count?: number;
    custom_name?: string;
    killeater_score_type?: number | null;
    /** Best-effort: present on items still inside their trade-protection window. */
    trade_protected_until?: number;
    stickers?: Array<{ slot: number; sticker_id: number; wear?: number }>;
    keychains?: Array<{ slot: number; sticker_id: number; pattern?: number }>;
    [key: string]: unknown;
  }

  class GlobalOffensive extends EventEmitter {
    constructor(steamUser: unknown);
    haveGCSession: boolean;
    inventory: GcItem[] | null;
    getCasketContents(casketId: string, callback: (err: Error | null, items?: GcItem[]) => void): void;
    addToCasket(casketId: string, itemId: string, callback?: (err: Error | null) => void): void;
    removeFromCasket(casketId: string, itemId: string, callback?: (err: Error | null) => void): void;
    nameItem(nameTagId: string | number, itemId: string, name: string, callback?: (err: Error | null) => void): void;
    on(event: "connectedToGC", listener: () => void): this;
    on(event: "disconnectedFromGC", listener: (reason: number) => void): this;
    on(event: "itemAcquired", listener: (item: GcItem) => void): this;
    on(event: "itemRemoved", listener: (item: GcItem) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  export = GlobalOffensive;
}
