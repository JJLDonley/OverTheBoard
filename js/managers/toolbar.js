import { canUseBoardShortcut } from "../utils/keyboard.js";
const TOOLS = [
    ['BlackStoneBtn', 'Black stone', '1', 'BLACK', '<circle cx="12" cy="12" r="8" fill="#111" stroke="#aaa"/>'],
    ['WhiteStoneBtn', 'White stone', '2', 'WHITE', '<circle cx="12" cy="12" r="8" fill="#fff" stroke="#aaa"/>'],
    ['AlternatingBtn', 'Alternating stones', '3', 'ALTERNATING', '<circle cx="8" cy="12" r="6" fill="#111" stroke="#aaa"/><circle cx="16" cy="12" r="6" fill="#fff" stroke="#aaa"/>'],
    ['PenBtn', 'Free draw', '4', 'PEN', '<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4M4 16l4 4"/>'],
    ['TriangleBtn', 'Triangle mark', '5', 'TRIANGLE', '<path d="m12 3 10 18H2L12 3Z"/>'],
    ['CircleBtn', 'Circle mark', '6', 'CIRCLE', '<circle cx="12" cy="12" r="8"/>'],
    ['SquareBtn', 'Square mark', '7', 'SQUARE', '<rect x="4" y="4" width="16" height="16" rx="1"/>'],
    ['LetterBtn', 'Letter mark', '8', 'LETTER', '<path d="m4 21 8-18 8 18M7 15h10"/>'],
    ['GridBtn', 'Toggle grid', 'S', null, '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'],
    ['CoordBtn', 'Toggle coordinates', 'C', null, '<path d="M9 3 7 21M17 3l-2 18M3 9h18M2 15h18"/>'],
    ['markupColor', 'Drawing and mark color', 'K', null, null],
];

export function setupToolbarTools() {
    const tooltip = document.createElement('div');
    tooltip.id = 'toolbarTooltip'; tooltip.className = 'toolbar-tooltip';
    tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
    document.body.append(tooltip);
    const hide = () => { tooltip.hidden = true; };
    TOOLS.forEach(([id, name, key, tool, paths]) => {
        const element = document.getElementById(id);
        element.removeAttribute('title');
        element.setAttribute('aria-label', name);
        element.setAttribute('aria-keyshortcuts', key);
        element.setAttribute('aria-describedby', tooltip.id);
        if (paths) element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
        const show = () => {
            tooltip.replaceChildren(document.createTextNode(name));
            const shortcut = document.createElement('kbd'); shortcut.textContent = key; tooltip.append(shortcut);
            tooltip.hidden = false;
            const rect = element.getBoundingClientRect();
            let left = rect.right + 10;
            if (left + tooltip.offsetWidth > innerWidth - 8) left = rect.left - tooltip.offsetWidth - 10;
            tooltip.style.left = `${Math.max(8, left)}px`;
            tooltip.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - tooltip.offsetHeight - 8))}px`;
        };
        element.addEventListener('pointerenter', show);
        element.addEventListener('pointerleave', hide);
        element.addEventListener('focus', show);
        element.addEventListener('blur', hide);
        element.addEventListener('pointerdown', hide);
    });
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { hide(); return; }
        if (!canUseBoardShortcut(event)) return;
        const entry = TOOLS.find(([, , key]) => key.toLowerCase() === event.key.toLowerCase());
        if (!entry || entry[0] === 'GridBtn') return; // Existing S shortcut handles grid.
        event.preventDefault();
        if (entry[3]) window.overlay.selectTool(entry[3], true);
        else if (entry[0] === 'markupColor') {
            const input = document.getElementById('markupColor');
            if (input.showPicker) input.showPicker(); else input.click();
        } else document.getElementById(entry[0]).click();
        hide();
    });
}
