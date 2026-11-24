import type { Transition, Variants } from 'motion/react';

/** The app's motion vocabulary. Short, springy, and only in response to the person's actions. */
export const spring: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 };
export const softSpring: Transition = { type: 'spring', stiffness: 320, damping: 32 };
export const ease: Transition = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] };

export const fade: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1 } };

/** Dialogs rise a little and settle. */
export const dialog: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  shown: { opacity: 1, y: 0, scale: 1 }
};

/** Popover menus grow from the point they were opened from. */
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: -4 },
  shown: { opacity: 1, scale: 1, y: 0 }
};

/** Views slide in from the direction of navigation (1 = forward, -1 = back). */
export const view: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 18 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -12 })
};
