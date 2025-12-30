import { BasesView, QueryController } from "obsidian";

export const LiteraryUniverseViewType = 'lu-view';

export class LiteraryUniverseBase extends BasesView {
    readonly type = LiteraryUniverseViewType;
    private containerEl: HTMLElement;

    constructor(controller: QueryController, parentEl: HTMLElement) {
        super(controller);
        this.containerEl = parentEl.createDiv('bases-lu-view-container');
    }
    
    onDataUpdated(): void {
        this.containerEl.empty();
        this.containerEl.createEl('h1', { text: 'Literary Universe resources' });
    }
}
