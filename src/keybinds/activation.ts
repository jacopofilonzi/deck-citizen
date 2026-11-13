import type { ActivationMode } from "./types.ts";

/** Fallback when an action declares nothing: a plain press. */
export const DEFAULT_ACTIVATION: ActivationMode = {
	name: "press",
	onPress: true,
	onHold: false,
	onRelease: false,
	multiTap: 1,
	pressTriggerThreshold: -1,
	releaseTriggerThreshold: -1,
	releaseTriggerDelay: 0,
};

/** Shortest hold the game reliably registers. */
export const SHORT_HOLD_MS = 50;
/** Extra time added on top of a hold threshold, so the game surely crosses it. */
const THRESHOLD_MARGIN_MS = 120;
/** Pause between the taps of a multi-tap. */
export const MULTI_TAP_GAP_MS = 60;

/**
 * How the plugin has to press an input so that the game triggers the action.
 *
 * - `timed`: press and release on its own, `taps` times, keeping the input down for `holdMs`.
 * - `passthrough`: the action lasts as long as the input is held, so the Stream Deck
 *   key is mirrored (down on key down, up on key up). `fallbackHoldMs` is used where
 *   there is no release event (e.g. a dial tick).
 */
export type PressPlan =
	| { kind: "timed"; holdMs: number; taps: number }
	| { kind: "passthrough"; fallbackHoldMs: number };

const seconds = (value: number): number => Math.round(value * 1000);

/**
 * Builds the press plan for an activation mode.
 */
export function planPress(mode: ActivationMode): PressPlan {
	if (mode.multiTap >= 2) {
		return { kind: "timed", holdMs: SHORT_HOLD_MS, taps: mode.multiTap };
	}
	if (mode.pressTriggerThreshold > 0) {
		return { kind: "timed", holdMs: seconds(mode.pressTriggerThreshold) + THRESHOLD_MARGIN_MS, taps: 1 };
	}
	if (mode.releaseTriggerThreshold > 0) {
		// Must be released before the threshold, or the game treats it as a hold.
		return { kind: "timed", holdMs: Math.min(SHORT_HOLD_MS, seconds(mode.releaseTriggerThreshold) / 3), taps: 1 };
	}
	if (mode.releaseTriggerDelay > 0) {
		// smart_toggle: a quick press toggles.
		return { kind: "timed", holdMs: SHORT_HOLD_MS, taps: 1 };
	}
	if (mode.onHold || (mode.onPress && mode.onRelease)) {
		return { kind: "passthrough", fallbackHoldMs: 100 };
	}
	return { kind: "timed", holdMs: SHORT_HOLD_MS, taps: 1 };
}

const flag = (value: string | undefined): boolean => value === "1";
const number = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseFloat(value ?? "");
	return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Reads an `<ActivationMode>` element.
 */
export function activationModeFromAttrs(attrs: Record<string, string>): ActivationMode {
	return {
		name: attrs.name ?? "",
		onPress: flag(attrs.onPress),
		onHold: flag(attrs.onHold),
		onRelease: flag(attrs.onRelease),
		multiTap: number(attrs.multiTap, 1),
		pressTriggerThreshold: number(attrs.pressTriggerThreshold, -1),
		releaseTriggerThreshold: number(attrs.releaseTriggerThreshold, -1),
		releaseTriggerDelay: number(attrs.releaseTriggerDelay, 0),
	};
}

/**
 * Reads activation behaviour declared directly on an `<action>` (`onPress`, `onHold`,
 * `holdTriggerDelay`, ...) instead of through a named mode. Returns undefined when the
 * action declares none.
 */
export function inlineActivationFromAttrs(attrs: Record<string, string>): ActivationMode | undefined {
	if (attrs.onPress === undefined && attrs.onHold === undefined && attrs.onRelease === undefined) {
		return undefined;
	}
	const onPress = flag(attrs.onPress);
	const onHold = flag(attrs.onHold);
	const holdDelay = number(attrs.holdTriggerDelay, -1);
	return {
		name: "inline",
		onPress,
		onHold,
		onRelease: flag(attrs.onRelease),
		multiTap: number(attrs.multiTap, 1),
		// An action that fires only after being held (e.g. "engine max") behaves like a delayed press.
		pressTriggerThreshold: onHold && !onPress && holdDelay > 0 ? holdDelay : -1,
		releaseTriggerThreshold: -1,
		releaseTriggerDelay: 0,
	};
}
