/**
 * Barrel of all Inngest functions registered with serve().
 * Add new functions here and they'll be picked up by /api/inngest.
 */
import { noopFn } from "./noop";

export const functions = [noopFn];
