// Run with a local static server: deno run -A tests/scene-picker.mjs
// Optional: OVERLAY_TEST_URL and PLAYWRIGHT_CHROMIUM_EXECUTABLE.
import { chromium } from 'npm:playwright@1.62.1';
const browser = await chromium.launch({
    executablePath: Deno.env.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') || undefined,
    args: ['--no-sandbox'],
});
const check = (value, message) => { if (!value) throw Error(message); };
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = new URL(Deno.env.get('OVERLAY_TEST_URL') || 'http://127.0.0.1:8765/');
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base.origin) return route.continue();
        // A fake VDO relay: commands are captured; confirmation is sent separately.
        return route.fulfill({ contentType: 'text/html', body: `<script>
            window.commands = [];
            addEventListener('message', event => {
                if (event.data.obsCommand) commands.push(event.data);
            });
        </script>` });
    });
    base.search = new URLSearchParams({ role: 'CO', label: 'Preview', Network: 'preview', obs: 'https://vdo.ninja/?room=preview' });
    await page.goto(base.href);
    await page.waitForFunction(() => !!window.obsController && !!window.cursorLabel);
    await page.locator('#openScenes').click();
    const names = ['Main', 'Intro', 'Hosts', 'Interview'];
    await page.locator('.scene-settings summary').click();
    for (const name of names) {
        check(await page.getByLabel(`${name} OBS scene name`, { exact: true }).inputValue() === name, `${name} default mapping`);
    }
    check(await page.locator('#scenePreviewGrid iframe').count() === 4, 'all previews enabled by default');
    await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
    const relay = await (await page.locator('#obs').elementHandle()).contentFrame();
    const state = async (currentScene, connected = true) => {
        await relay.evaluate(({ currentScene, connected }) => parent.postMessage({
            action: 'obs-state', value: { UUID: 'fake-obs', details: { connected, currentScene } },
        }, '*'), { currentScene, connected });
        await page.waitForFunction(connected => window.obsController.isConnected === connected, connected);
    };
    await state('Unlisted scene');
    for (const [index, name] of names.entries()) {
        await page.locator('.scene-preview-card').nth(index).click();
        await relay.waitForFunction(count => commands.length === count, index + 1);
        const command = await relay.evaluate(() => commands.at(-1));
        check(command.obsCommand.action === 'setCurrentScene' && command.obsCommand.value === name && command.UUID === 'fake-obs', `${name} relay command`);
        check(!await page.locator('.scene-preview-card').nth(index).evaluate(card => card.classList.contains('active')), 'wait for confirmation');
        await state(name);
        await page.waitForFunction(name => document.querySelector('.scene-preview-card.active strong')?.textContent === name, name);
    }
    // Real VDO sends empty details and visibility-only messages after its
    // initial scene list; those must not disable working scene controls.
    await relay.evaluate(() => {
        parent.postMessage({ action: 'obs-state', value: { details: {} } }, '*');
        parent.postMessage({ action: 'obs-state', value: { visibility: true } }, '*');
    });
    await page.waitForTimeout(100);
    check(await page.evaluate(() => window.obsController.isConnected), 'partial status preserves connection');
    await state('Interview', false);
    check(await page.locator('.scene-preview-card:disabled').count() === 4, 'disconnect disables switching');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('#scenePreviewGrid iframe').length === 0);
    await page.goto(base.origin + base.pathname);
    await page.waitForFunction(() => !!window.scenePicker);
    await page.locator('.landing-advanced summary').click();
    await page.locator('#sceneMiniPc').fill('7');
    await page.getByLabel('Main OBS scene name', { exact: true }).fill('Board & Players');
    await page.getByLabel('Main preview URL', { exact: true }).fill('/stream-overlay/{pc}?title=A&B=2');
    await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
    const shared = new URL(await page.locator('.host-link').first().getAttribute('data-url'));
    check(shared.searchParams.get('miniPc') === '7', 'shared mini PC');
    check(shared.searchParams.get('sceneMainName') === 'Board & Players', 'encoded scene name');
    check(shared.searchParams.get('sceneMainUrl') === '/stream-overlay/{pc}?title=A&B=2', 'nested URL round trip');
    await page.evaluate(() => localStorage.setItem('overlayScenePreviews', JSON.stringify({version:2,pc:'99',scenes:[{scene:'Wrong',enabled:false}]})));
    shared.searchParams.set('label', 'Test');
    await page.goto(shared.href);
    await page.waitForFunction(() => !!window.scenePicker && !!window.cursorLabel);
    await page.locator('#openScenes').click();
    check(await page.locator('#scenePreviewGrid iframe').count() === 4, 'URL overrides locally disabled scene');
    check((await page.locator('#scenePreviewGrid iframe').first().getAttribute('src')) === 'https://app.baduk.club/stream-overlay/7?title=A&B=2', 'shared preview URL and PC');
    check(await page.getByLabel('Main OBS scene name', {exact:true}).inputValue() === 'Board & Players', 'shared OBS name overrides storage');
    check(errors.length === 0, errors.join('\n'));
    console.log('PASS: four default names, relay commands, confirmed Live indicators, disconnect, preview cleanup, Advanced settings and shared URL round trip');
} finally {
    await browser.close();
}
