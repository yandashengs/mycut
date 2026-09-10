/**
 * 【我的刀盾】规则引擎 —— 类型定义
 *
 * 设计原则：
 * - 纯数据状态机：GameState 完全可 JSON 序列化，reducer 为纯函数
 * - 隐藏信息只存在于 pendingBid / pendingPlacement 两个字段，
 *   通过 createView 做视角过滤，日志 LogEntry 只允许包含已开牌的公开信息
 */

/** 座位标识：A 默认为主视角（单机模式中即人类玩家） */
export type Seat = 'A' | 'B';

export type WeaponId = 'pistol' | 'saber' | 'stunner';
export type ShieldId = 'iron' | 'leather' | 'rubber';
export type EquipId = WeaponId | ShieldId;

export type Phase =
  /** 阶段一：初始身份竞拍（仅开局一次） */
  | 'AUCTION_IDENTITY'
  /** 阶段二①：双盲放置 */
  | 'PLACE'
  /** 阶段二②：使用权竞拍 */
  | 'AUCTION_WEAPON'
  | 'GAME_OVER';

export type AuctionKind = 'identity' | 'weapon';

/** 游戏动作（唯一输入入口） */
export type Action =
  | { type: 'BID'; seat: Seat; amount: number }
  | { type: 'PLACE'; seat: Seat; equip: EquipId };

/**
 * 公开日志条目。
 * 重要：任何条目都不得包含“尚未开牌”的隐藏信息
 * （例如对方已提交但未开牌的出价/放置内容）。
 */
export type LogEntry =
  | {
      kind: 'auctionTie';
      auction: AuctionKind;
      /** 平局开牌：双方出价相同，公开各自数值 */
      bids: Record<Seat, number>;
      /** 本场竞拍内连续第几次平局 */
      tieStreak: number;
    }
  | {
      kind: 'auctionResolved';
      auction: AuctionKind;
      winner: Seat;
      bids: Record<Seat, number>;
      hpAfter: Record<Seat, number>;
    }
  | {
      /** 防死锁终极裁决：连续平局达上限，标的直接判给先手，不扣血 */
      kind: 'deadlockAwarded';
      auction: AuctionKind;
      seat: Seat;
    }
  | {
      kind: 'roundResolved';
      round: number;
      cycle: number;
      weapon: WeaponId;
      shield: ShieldId;
      weaponPlacer: Seat;
      shieldPlacer: Seat;
      weaponUser: Seat;
      shieldUser: Seat;
      /** 持盾方本次受到的伤害（按克制矩阵） */
      damage: number;
      /** 回合结束流血（伤害致死时为 0，即跳过流血） */
      bleed: number;
      hpAfter: Record<Seat, number>;
      /** 本回合登场并因此进入冷却的装备 */
      enteredCooldown: EquipId[];
    }
  | {
      kind: 'gameOver';
      winner: Seat | 'DRAW';
      reason: 'damage' | 'bleed';
      round: number;
    };

export interface PlayerState {
  hp: number;
  /** 已提交、尚未开牌的出价（隐藏信息，视角过滤对象） */
  pendingBid?: number;
  /** 已提交、尚未开牌的放置（隐藏信息，视角过滤对象） */
  pendingPlacement?: EquipId;
}

/** 进行中竞拍的状态 */
export interface AuctionState {
  kind: AuctionKind;
  /** 本场竞拍内的连续平局次数（驱动防死锁的最低出价递增与终极裁决） */
  tieStreak: number;
}

export interface GameState {
  phase: Phase;
  /** 全局小轮序号，从 1 开始（当前正在/即将进行的小轮） */
  round: number;
  /** 大周期序号，从 1 开始（每 3 个小轮为一周期） */
  cycle: number;
  /** 当前周期内的小轮序号 1..3 */
  roundInCycle: 1 | 2 | 3;
  /** 当前持有武器放置权的一方（另一方持盾牌放置权） */
  weaponPlacer: Seat;
  /**
   * 对称死锁的终极裁决人（开局一次性确定）。
   * 单机模式默认 'A'（玩家）；联机模式可随机指派。
   */
  firstMover: Seat;
  players: Record<Seat, PlayerState>;
  /** 进行中的竞拍；phase 为 AUCTION_* 时非空 */
  auction: AuctionState | null;
  /** 本小轮双盲放置结果（双方都提交后才填充；结算前对双方互相隐藏） */
  placements: { weapon?: WeaponId; shield?: ShieldId };
  /** 每件装备累计使用次数（达到 USAGE_LIMIT 进入冷却） */
  usage: Record<EquipId, number>;
  /** 每件装备剩余冷却小轮数（0 = 可放置） */
  cooldown: Record<EquipId, number>;
  log: LogEntry[];
  winner: Seat | 'DRAW' | null;
}

/** 玩家视角（脱敏后的状态，前端/AI 只允许接触这个） */
export interface PlayerView {
  phase: Phase;
  round: number;
  cycle: number;
  roundInCycle: 1 | 2 | 3;
  weaponPlacer: Seat;
  firstMover: Seat;
  self: {
    seat: Seat;
    hp: number;
    pendingBid?: number;
    pendingPlacement?: EquipId;
    /** 当前合法出价范围 [min, max]（含边界）；仅在拍卖阶段且未提交时存在 */
    bidRange?: { min: number; max: number };
    /** 本周期我方放置角色 */
    placementRole: 'weapon' | 'shield';
  };
  opponent: {
    seat: Seat;
    hp: number;
    /** 对方是否已提交出价（仅布尔，不含内容） */
    hasPendingBid: boolean;
    /** 对方是否已提交放置（仅布尔，不含内容） */
    hasSubmittedPlacement: boolean;
  };
  usage: Record<EquipId, number>;
  cooldown: Record<EquipId, number>;
  log: LogEntry[];
  winner: Seat | 'DRAW' | null;
}

/** 合法动作描述（由 legalActions 计算，供 UI / AI 使用） */
export type LegalAction =
  | { type: 'BID'; seat: Seat; min: number; max: number }
  | { type: 'PLACE'; seat: Seat; role: 'weapon' | 'shield'; options: EquipId[] };
