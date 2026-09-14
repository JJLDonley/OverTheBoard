// Board shortcuts must not intercept browser commands or editing controls.
export function canUseBoardShortcut(event) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        window.isViewerMode || window.appMode !== 'commentator' ||
        document.querySelector('dialog[open], .help-modal:not(.hidden)')) return false;
    const active = document.activeElement;
    if (active?.isContentEditable || active?.closest('input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"]')) return false;
    // Space/Enter should activate a focused control, not clear annotations.
    if ((event.key === ' ' || event.key === 'Enter') && active?.closest('button, a, [role="button"]')) return false;
    return true;
}
