import { DEFAULT_ACTIVATION } from "./activation.ts";
import type { ActionId, ActivationMode, BindLayer, EffectiveBind } from "./types.ts";

/**
 * Stacks bind layers and answers "what does this action do right now".
 * Layers are ordered from lowest to highest priority (defaults first, user overrides last);
 * for every field the highest layer that states it wins.
 */
export class KeybindResolver {
	readonly #layers: BindLayer[];
	readonly #cache = new Map<ActionId, EffectiveBind | undefined>();

	constructor(layers: BindLayer[]) {
		this.#layers = layers;
	}

	get layers(): readonly BindLayer[] {
		return this.#layers;
	}

	/**
	 * Returns true if at least one layer knows the action.
	 */
	has(id: ActionId): boolean {
		return this.#layers.some((layer) => layer.actions.has(id));
	}

	/**
	 * Resolves an action. Returns undefined when no layer knows it (e.g. it was removed
	 * from the game); returns a bind with empty `inputs` when it exists but is unbound.
	 */
	resolve(id: ActionId): EffectiveBind | undefined {
		if (this.#cache.has(id)) {
			return this.#cache.get(id);
		}
		const result = this.#resolve(id);
		this.#cache.set(id, result);
		return result;
	}

	#resolve(id: ActionId): EffectiveBind | undefined {
		if (!this.has(id)) {
			return undefined;
		}

		let inputs: string[] = [];
		let inputsFrom: string | undefined;
		let modeName: string | undefined;
		let inline: ActivationMode | undefined;
		let label: string | undefined;

		for (const layer of this.#layers) {
			const entry = layer.actions.get(id);
			if (!entry) {
				continue;
			}
			if (entry.inputs !== undefined) {
				inputs = entry.inputs;
				inputsFrom = layer.name;
			}
			if (entry.activationMode !== undefined) {
				modeName = entry.activationMode;
				inline = undefined;
			} else if (entry.inlineActivation !== undefined) {
				inline = entry.inlineActivation;
				modeName = undefined;
			}
			label = entry.label ?? label;
		}

		return {
			id,
			inputs,
			inputsFrom: inputs.length > 0 ? inputsFrom : undefined,
			activation: (modeName !== undefined ? this.#activationMode(modeName) : inline) ?? DEFAULT_ACTIVATION,
			label,
		};
	}

	#activationMode(name: string): ActivationMode | undefined {
		for (let i = this.#layers.length - 1; i >= 0; i--) {
			const mode = this.#layers[i]?.activationModes.get(name);
			if (mode) {
				return mode;
			}
		}
		return undefined;
	}
}
