/**
 * Identifier of a game action: `<actionmap>/<action>`, e.g. `spaceship_general/v_open_all_doors`.
 * The same action name can exist in more than one actionmap, so both parts are needed.
 */
export type ActionId = `${string}/${string}`;

/**
 * How the game reacts to an input over time, as defined by the `<ActivationMode>`
 * entries in defaultProfile.xml (thresholds are in seconds, -1 means "not used").
 */
export type ActivationMode = {
	name: string;
	onPress: boolean;
	onHold: boolean;
	onRelease: boolean;
	multiTap: number;
	pressTriggerThreshold: number;
	releaseTriggerThreshold: number;
	releaseTriggerDelay: number;
};

/**
 * Bind information for one action as provided by a single layer. Every field is
 * optional: a layer only states what it changes.
 */
export type LayerEntry = {
	/**
	 * Keyboard/mouse inputs, e.g. `["ralt+np_0"]`. `undefined` = not specified by
	 * this layer; empty array = explicitly unbound.
	 */
	inputs?: string[];
	/** Name of a shared activation mode. */
	activationMode?: string;
	/** Activation behaviour declared directly on the action instead of by name. */
	inlineActivation?: ActivationMode;
	/** Localization key of the in-game label, e.g. `@ui_CICockpitDoorsOpenAll`. */
	label?: string;
};

/**
 * A set of binds coming from one source (bundled defaults, the user's actionmaps.xml, ...).
 */
export type BindLayer = {
	name: string;
	actions: Map<ActionId, LayerEntry>;
	activationModes: Map<string, ActivationMode>;
	/** Game build the layer was taken from, when known (e.g. `sc-alpha-4.10.2`). */
	build?: string;
	/** Default binds only: read from the installed game, or the copy bundled with the plugin. */
	origin?: "game" | "bundled";
};

/**
 * The resolved bind of an action after all layers have been applied.
 */
export type EffectiveBind = {
	id: ActionId;
	/** Keyboard/mouse inputs; empty when the action has no usable bind. */
	inputs: string[];
	activation: ActivationMode;
	label?: string;
	/** Name of the layer that provided `inputs`. */
	inputsFrom?: string;
};

/**
 * Something that can provide a layer of binds. Implementations are interchangeable,
 * which is what makes the source of truth configurable.
 */
export interface KeybindSource {
	readonly name: string;
	load(): Promise<BindLayer>;
	/** Files whose changes should trigger a reload. */
	watchedFiles?(): string[];
}
