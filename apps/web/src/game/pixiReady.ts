/**
 * PixiJS entry — G2 playfield lives in classicPlayfield.ts.
 * Re-export keeps the G0/G1 import surface valid if anything still references it.
 */
export { Application } from 'pixi.js'
export { ClassicPlayfield } from '@/game/classicPlayfield'
