/**
 * 装备图标（纯 SVG，stroke 风格，currentColor 随外层着色）
 */
import type { EquipId } from '@engine';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function EquipIcon({ id, className }: { id: EquipId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...S}>
      {paths[id]}
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...S}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const paths: Record<EquipId, React.ReactNode> = {
  // 手枪：枪身 + 握把 + 护圈
  pistol: (
    <>
      <path d="M2.5 7h18v4h-2.5l-1 5.5h-4l1-5.5H9.6l-.8 4.5H5.3l.8-4.5H2.5z" />
      <path d="M20.5 8.4H22" strokeWidth={2.2} />
    </>
  ),
  // 长刀：弧形刀刃 + 十字护手
  saber: (
    <>
      <path d="M21 3c-2.6 1.3-5.6 4.1-8.1 7.6L6.3 17.9 5 21l3.1-1.3 7.3-6.6C18.2 10.3 20 6.3 21 3z" />
      <path d="M5.6 16.8l3.2 3.2" />
    </>
  ),
  // 电击枪：闪电
  stunner: <path d="M13.5 2 5 13.5h4.6L8.4 22 17 10.5h-4.6L13.5 2z" />,
  // 铁盾：尖底盾 + 中脊
  iron: (
    <>
      <path d="M12 2.8 19 5.4v5.3c0 4.6-3 8.5-7 10.5-4-2-7-5.9-7-10.5V5.4z" />
      <path d="M12 2.8v18.4" />
    </>
  ),
  // 皮盾：圆盾 + 中心圆凸
  leather: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="6.3" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="6.3" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="17.7" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  // 橡胶盾：六边盾 + 缓冲环
  rubber: (
    <>
      <path d="M12 3l7.5 4.3v9.4L12 21l-7.5-4.3V7.3z" />
      <circle cx="12" cy="12" r="3.6" />
    </>
  ),
};
