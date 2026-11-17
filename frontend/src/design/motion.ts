import { useReducedMotion } from 'framer-motion';

export interface UiTransition {
  duration: number;
  ease: 'easeOut';
}

export function transitionForMotionPreference(prefersReducedMotion: boolean): UiTransition {
  return { duration: prefersReducedMotion ? 0 : 0.16, ease: 'easeOut' };
}

export function useMotionPreferences() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  return {
    prefersReducedMotion,
    transition: transitionForMotionPreference(prefersReducedMotion),
  };
}
