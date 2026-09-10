/**
 * 【我的刀盾】规则常量 —— 所有可调数值集中于此
 */
import type { ShieldId, WeaponId } from './types';

/** 初始血量 */
export const INITIAL_HP = 100;

/** 每小轮结束的流血惩罚（时间惩罚） */
export const BLEED_PER_ROUND = 5;

/** 装备累计使用次数达到该值后进入冷却 */
export const USAGE_LIMIT = 2;

/** 冷却锁定的小轮数 */
export const COOLDOWN_ROUNDS = 2;

/**
 * 防死锁：同一场竞拍内连续平局达到该次数后，
 * 最低出价开始递增（第 4 次至少出 1，第 5 次至少出 3，第 6 次至少出 5……）
 */
export const TIE_MINBID_THRESHOLD = 3;

/**
 * 防死锁终极裁决：同一场竞拍内连续平局达到该次数后，
 * 竞拍标的直接判给 firstMover（不扣血），彻底保证游戏可终结。
 */
export const TIE_FORCED_AWARD = 6;

export const WEAPONS: readonly WeaponId[] = ['pistol', 'saber', 'stunner'];
export const SHIELDS: readonly ShieldId[] = ['iron', 'leather', 'rubber'];

/**
 * 伤害矩阵：DAMAGE_MATRIX[武器][盾牌] = 持盾方受到的伤害
 *            铁盾   皮盾   橡胶盾
 * 手枪        0     30     30
 * 长刀        0      8     22
 * 电击枪     22      4      0
 */
export const DAMAGE_MATRIX: Record<WeaponId, Record<ShieldId, number>> = {
  pistol: { iron: 0, leather: 30, rubber: 30 },
  saber: { iron: 0, leather: 8, rubber: 22 },
  stunner: { iron: 22, leather: 4, rubber: 0 },
};

export const EQUIP_NAMES: Record<string, string> = {
  pistol: '手枪',
  saber: '长刀',
  stunner: '电击枪',
  iron: '铁盾',
  leather: '皮盾',
  rubber: '橡胶盾',
};
