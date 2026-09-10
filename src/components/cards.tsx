/**
 * 卡牌与矩阵组件：EquipCard（带克制矩阵牌面）、CardBack（卡背）、MatrixGrid（3×3 热力图）
 * 全部纯 CSS/SVG，无图片资源
 */
import { Fragment } from 'react';
import { DAMAGE_MATRIX, EQUIP_NAMES, SHIELDS, WEAPONS } from '@engine';
import type { EquipId, ShieldId, WeaponId } from '@engine';
import { EquipIcon, LockIcon } from '../icons';

export function isWeaponId(e: EquipId): boolean {
  return (WEAPONS as readonly string[]).includes(e);
}

/** 伤害 → 语义色 */
export function dmgClass(d: number, hot = false): string {
  if (hot) return 'text-bone';
  if (d === 0) return 'text-smoke/45';
  if (d <= 8) return 'text-steel/80';
  return 'text-blood-bright/80';
}

/** 3×3 克制矩阵热力图，可高亮指定武器×盾牌的格子 */
export function MatrixGrid({ weapon, shield }: { weapon?: WeaponId; shield?: ShieldId }) {
  return (
    <div className="grid grid-cols-4 gap-1 select-none">
      <div />
      {SHIELDS.map((s) => (
        <EquipIcon key={s} id={s} className="w-4 h-4 mx-auto text-smoke/70" />
      ))}
      {WEAPONS.map((w) => (
        <Fragment key={w}>
          <EquipIcon id={w} className="w-4 h-4 my-auto text-smoke/70" />
          {SHIELDS.map((s) => {
            const d = DAMAGE_MATRIX[w][s];
            const hot = w === weapon && s === shield;
            return (
              <div
                key={s}
                className={`flex items-center justify-center h-6 rounded font-display text-xs tabular-nums transition-all
                  ${hot ? 'bg-brass/25 text-bone ring-1 ring-brass shadow-[0_0_14px_rgba(201,162,92,0.35)]' : dmgClass(d)}`}
              >
                {d}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

const SIZE = {
  sm: 'w-16',
  md: 'w-[5.5rem]',
  lg: 'w-24',
} as const;

interface EquipCardProps {
  id: EquipId;
  size?: keyof typeof SIZE;
  selected?: boolean;
  disabled?: boolean;
  usage?: number;
  cooldown?: number;
  onClick?: () => void;
}

/** 装备卡：图标 + 名称 + 克制矩阵简表 + 使用点数/冷却 */
export function EquipCard({ id, size = 'md', selected, disabled, usage = 0, cooldown = 0, onClick }: EquipCardProps) {
  const isW = isWeaponId(id);
  const cooling = cooldown > 0;
  const vsList: EquipId[] = isW ? [...SHIELDS] : [...WEAPONS];
  const clickable = !!onClick && !disabled && !cooling;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      className={`grain relative shrink-0 ${SIZE[size]} aspect-[3/4] rounded-xl border p-1.5 flex flex-col items-center justify-between transition-all duration-200
        ${isW
          ? 'bg-gradient-to-b from-[#2b1216] to-[#150c0e] border-blood/30'
          : 'bg-gradient-to-b from-[#152029] to-[#0d1319] border-steel/30'}
        ${selected ? 'border-blood-bright shadow-[0_0_18px_rgba(229,72,77,0.45)] -translate-y-1' : ''}
        ${disabled || cooling ? 'opacity-40 grayscale' : ''}
        ${clickable ? 'cursor-pointer hover:border-brass/60 active:scale-95' : 'cursor-default'}`}
      aria-label={EQUIP_NAMES[id]}
    >
      {/* 图标 + 名称 */}
      <div className="flex flex-col items-center gap-0.5 pt-1">
        <EquipIcon
          id={id}
          className={`${size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'} ${isW ? 'text-blood-bright' : 'text-steel'}`}
        />
        <span className="font-kai text-[11px] leading-none text-bone/90">{EQUIP_NAMES[id]}</span>
      </div>

      {/* 克制简表 */}
      <div className="w-full grid grid-cols-3 gap-px">
        {vsList.map((v) => {
          const dmg = isW
            ? DAMAGE_MATRIX[id as WeaponId][v as ShieldId]
            : DAMAGE_MATRIX[v as WeaponId][id as ShieldId];
          return (
            <div key={v} className="flex flex-col items-center gap-0.5">
              <EquipIcon id={v} className="w-3 h-3 text-smoke/60" />
              <span className={`font-display text-[10px] leading-none tabular-nums ${dmgClass(dmg)}`}>{dmg}</span>
            </div>
          );
        })}
      </div>

      {/* 使用点数 */}
      {usage > 0 && !cooling && (
        <div className="absolute top-1 left-1.5 flex gap-0.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full ${i < usage ? 'bg-brass' : 'bg-smoke/30'}`}
            />
          ))}
        </div>
      )}

      {/* 冷却遮罩 */}
      {cooling && (
        <div className="absolute inset-0 rounded-xl bg-ink/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-0.5">
          <LockIcon className="w-4 h-4 text-brass" />
          <span className="text-[10px] text-brass font-display">×{cooldown}</span>
        </div>
      )}
    </button>
  );
}

/** 卡背（对面放下的暗牌） */
export function CardBack({ tone = '#c9a25c', size = 'md' }: { tone?: string; size?: keyof typeof SIZE }) {
  return (
    <div
      className={`card-back ${SIZE[size]} aspect-[3/4] rounded-xl flex items-center justify-center`}
      style={{ borderColor: `${tone}66` }}
    >
      <span className="font-display text-2xl" style={{ color: `${tone}99` }}>
        ?
      </span>
    </div>
  );
}
