import type { Transition } from 'framer-motion';

export const snappy: Transition = { type: 'spring', stiffness: 520, damping: 38 };
export const gentle: Transition = { type: 'spring', stiffness: 320, damping: 32 };
export const fade: Transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] };
