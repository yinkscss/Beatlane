/** Hit grades, score fantasy, and star→crown rail — design-pack + beat-pitch. */

export type JudgeGrade = 'perfect' | 'great' | 'miss'

export const SCORE_PERFECT = 320
export const SCORE_GREAT = 180

/** Combo hits needed to light each of 3 stars then 3 crowns (flag sits mid-rail). */
export const COMBO_PER_MARK = 4
export const STAR_MARKS = 3
export const CROWN_MARKS = 3
export const TOTAL_MARKS = STAR_MARKS + CROWN_MARKS
/** Combo that fills the rail (3★ + 3👑). */
export const COMBO_FULL_RAIL = TOTAL_MARKS * COMBO_PER_MARK

export function pointsForGrade(grade: Exclude<JudgeGrade, 'miss'>): number {
  return grade === 'perfect' ? SCORE_PERFECT : SCORE_GREAT
}

/** How many of the 6 star/crown marks are lit (flag is always the midpoint marker). */
export function litMarksFromCombo(combo: number): number {
  if (combo <= 0) return 0
  return Math.min(TOTAL_MARKS, Math.floor(combo / COMBO_PER_MARK))
}

/** Fill width 0–100 for the progress rail. */
export function railFillPct(combo: number): number {
  if (combo <= 0) return 0
  return Math.min(100, (combo / COMBO_FULL_RAIL) * 100)
}

export type RailMarkKind = 'star' | 'flag' | 'crown'

export type RailMark = {
  kind: RailMarkKind
  /** True when this star/crown is earned; flag lights at ≥50% fill. */
  on: boolean
}

/** Marks order matching design-pack: ⭐⭐⭐ ⚑ 👑👑👑 */
export function railMarks(combo: number): RailMark[] {
  const lit = litMarksFromCombo(combo)
  const fill = railFillPct(combo)
  return [
    { kind: 'star', on: lit >= 1 },
    { kind: 'star', on: lit >= 2 },
    { kind: 'star', on: lit >= 3 },
    { kind: 'flag', on: fill >= 50 },
    { kind: 'crown', on: lit >= 4 },
    { kind: 'crown', on: lit >= 5 },
    { kind: 'crown', on: lit >= 6 },
  ]
}
