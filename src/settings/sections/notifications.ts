/**
 * Notifications section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L3485-3603)
 * in Phase 5 of the section-renderer extraction. Control order, copy and every
 * settings path are unchanged; only `this.` became `ctx.`, verified by
 * byte-exact roundtrip rather than by re-reading.
 *
 * The desktop-notification rows are privacy-gated and the completion sound is
 * picked from the shared `COMPLETION_SOUND_VARIANTS` catalogue, so the preview
 * button here and the cue the agent actually plays can never disagree.
 */

import { Notice, Setting } from "obsidian";
import { COMPLETION_SOUND_VARIANTS } from "../../completionSound";
import type { SectionContext } from "./context";

export function notifications(ctx: SectionContext, containerEl: HTMLElement): void {
	const prefs = ctx.plugin.settings.notifications;
	const status = ctx.plugin.getNativeNotificationStatus();
	const statusText = !status.supported
		? status.reason === "mobile"
			? "Unavailable on mobile. Native banners are desktop-only; Obsidian notices still work."
			: "Unavailable in this desktop runtime. Obsidian notices still work."
		: status.permission === "granted"
			? "Supported · permission granted."
			: status.permission === "denied"
				? "Supported · permission denied. Re-enable notifications for Obsidian in system settings."
				: "Supported · permission not requested. Use the test button to request it from a user gesture.";

	ctx.subheading(
		containerEl,
		"Native desktop notifications",
		"Optional OS banners layered on top of existing Obsidian notices. Open Agent must be running."
	);
	new Setting(containerEl).setName("Native notification status").setDesc(statusText);

	new Setting(containerEl)
		.setName("Enable native notifications")
		.setDesc("Master switch. Off by default; individual event choices below are ready when you opt in.")
		.addToggle((t) =>
			t.setValue(prefs.nativeEnabled).onChange(async (value) => {
				prefs.nativeEnabled = value;
				ctx.plugin.saveSettingsSafe();
			})
		);

	const nativeKinds: { key: keyof typeof prefs.nativeKinds; name: string; desc: string }[] = [
		{ key: "turnDone", name: "Chat completed", desc: "Away-only banner after the final interactive turn, including steer/goal continuations." },
		{ key: "turnError", name: "Chat error", desc: "Away-only generic alert. Stop/abort never counts as an error." },
		{ key: "approvalRequired", name: "Approval required", desc: "Alerts while away, or while the chat pane is not visible." },
		{ key: "inputRequired", name: "Input required", desc: "Alerts while away, or while the chat pane is not visible." },
		{ key: "backgroundDone", name: "Automation completed", desc: "Away-only; also requires that automation's Notify switch and non-silent output." },
		{ key: "backgroundError", name: "Automation error", desc: "Away-only generic alert, independent of the automation's Notify switch." },
	];
	for (const item of nativeKinds) {
		new Setting(containerEl)
			.setName(item.name)
			.setDesc(item.desc)
			.addToggle((t) =>
				t.setValue(prefs.nativeKinds[item.key]).onChange(async (value) => {
					prefs.nativeKinds[item.key] = value;
					ctx.plugin.saveSettingsSafe();
				})
			);
	}

	new Setting(containerEl)
		.setName("Test native notification")
		.setDesc("Sends a test banner — the only action that may ask for OS permission. Works even while notifications are off.")
		.addButton((button) => {
			button.setButtonText(
				status.permission === "default"
					? "Request permission & test"
					: status.permission === "denied"
						? "Permission denied"
						: "Send test"
			);
			button.setDisabled(!status.supported || status.permission === "denied");
			button.onClick(async () => {
				button.setDisabled(true).setButtonText("Sending…");
				const result = await ctx.plugin.testNativeNotification();
				const message =
					result === "sent"
						? "Open Agent: test handed to the operating system."
						: result === "denied"
							? "Open Agent: notification permission was not granted."
							: result === "unsupported"
								? "Open Agent: native notifications are unavailable here."
								: "Open Agent: the native notification test failed.";
				new Notice(message, 6000);
				ctx.display();
			});
		});

	ctx.subheading(
		containerEl,
		"Completion sound",
		"Independent per-vault app cue for a successful terminal interactive-chat turn. Never plays for errors, approvals, input, Stop, or automations."
	);
	new Setting(containerEl)
		.setName("Play completion sound")
		.setDesc(
			ctx.plugin.isCompletionSoundSupported()
				? "Off by default. Generated locally with Web Audio; no audio file or network request."
				: "Web Audio is unavailable in this runtime, so completion cues cannot play."
		)
		.addToggle((t) =>
			t.setValue(prefs.completionSoundEnabled).onChange(async (value) => {
				prefs.completionSoundEnabled = value;
				ctx.plugin.saveSettingsSafe();
			})
		);

	const selected = COMPLETION_SOUND_VARIANTS.find((v) => v.id === prefs.completionSoundVariant) ?? COMPLETION_SOUND_VARIANTS[0];
	new Setting(containerEl)
		.setName("Completion sound preset")
		.setDesc(`${selected.description} Preview works even while completion sound is off.`)
		.addDropdown((dropdown) => {
			for (const variant of COMPLETION_SOUND_VARIANTS) dropdown.addOption(String(variant.id), variant.name);
			dropdown.setValue(String(selected.id)).onChange(async (value) => {
				prefs.completionSoundVariant = Number(value);
				await ctx.plugin.saveSettings();
				ctx.display();
			});
		})
		.addButton((button) =>
			button
				.setButtonText("Preview")
				.setDisabled(!ctx.plugin.isCompletionSoundSupported())
				.onClick(async () => {
					const result = await ctx.plugin.previewCompletionSound(prefs.completionSoundVariant);
					if (result !== "played") new Notice("Open Agent: completion sound could not play in this runtime.", 5000);
				})
		);
}
