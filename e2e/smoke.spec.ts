import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Recompute the drill from what is on screen, e.g. "47 + 38" -> 85. */
async function sumOnScreen(page: Page): Promise<number> {
  const prompt = (await page.getByTestId('prompt').textContent()) ?? '';
  const [a, b] = prompt.split('+').map((part) => Number(part.trim().replaceAll(',', '')));
  return a! + b!;
}

/** Type a number using the on-screen keypad only. */
async function typeOnKeypad(page: Page, text: string) {
  const keypad = page.getByRole('group', { name: 'Keypad' });
  for (const char of text) {
    await keypad.getByRole('button', { name: char === '.' ? 'Decimal point' : char, exact: true }).click();
  }
}

test('a drill session can be completed on the keypad, progress survives reload, and the app opens offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByTestId('answered-count')).toHaveText('0');
  // A new owner starts at the basics.
  await expect(page.getByTestId('next-skill')).toHaveText('Addition');

  // On every phone size the Start session button is fully visible without scrolling, in the bottom third,
  // and the two spot check buttons under it fit on one row, each label on one line.
  const phone = page.viewportSize()!;
  for (const size of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 393, height: 660 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(size);
    const start = page.getByRole('button', { name: 'Start session' });
    await expect(start).toBeInViewport({ ratio: 1 });
    expect((await start.boundingBox())!.y).toBeGreaterThan((size.height * 2) / 3);
    const one = page.getByTestId('spot-check-1');
    const three = page.getByTestId('spot-check-3');
    await expect(one).toBeInViewport({ ratio: 1 });
    await expect(three).toBeInViewport({ ratio: 1 });
    expect((await one.boundingBox())!.y).toBe((await three.boundingBox())!.y);
    for (const button of [one, three]) {
      const fits = await button.evaluate((b) => {
        const text = document.createRange();
        text.selectNodeContents(b);
        const lines = new Set([...text.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        return lines.size === 1 && b.scrollWidth <= b.clientWidth;
      });
      expect(fits).toBe(true);
    }
  }
  await page.setViewportSize(phone);

  await page.getByRole('button', { name: 'Start session' }).click();
  const submit = page.getByRole('button', { name: 'Submit' });

  for (let drill = 1; drill <= 5; drill++) {
    await expect(page.getByRole('list', { name: `Drill ${drill} of 5` })).toBeVisible();
    const truth = await sumOnScreen(page);

    // An answer is required: nothing typed, nothing to submit.
    await expect(submit).toBeDisabled();

    if (drill === 1) {
      // Digits, decimal point and delete all work.
      await typeOnKeypad(page, '8.5');
      await expect(page.getByTestId('entry')).toContainText('8.5');
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Delete' }).click();
      await expect(submit).toBeDisabled();
    }

    // Drill 3 is a near miss; exact marking must call it wrong.
    const typed = drill === 3 ? truth + 1 : truth;
    await typeOnKeypad(page, String(typed));
    await submit.click();

    await expect(page.getByRole('status')).toContainText(drill === 3 ? 'Not quite' : 'Correct');
    await expect(page.getByTestId('correct-value')).toHaveText(new Intl.NumberFormat('en-US').format(truth));
    await expect(page.getByTestId('xp-line')).toContainText(drill === 3 ? '0 XP' : '+');
    await expect(page.getByRole('heading', { name: 'Worked solution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shortcut' })).toBeVisible();

    await page.getByRole('button', { name: drill === 5 ? 'See summary' : 'Next drill' }).click();
  }

  await expect(page.getByTestId('score')).toHaveText('4/5');
  await expect(page.getByTestId('session-time')).toHaveText(/\d/);
  await expect(page.getByTestId('session-xp')).toHaveText(/\+\d+/);
  await expect(page.getByTestId('rank')).toHaveText('Intern');
  await expect(page.getByRole('button', { name: 'Another session' })).toBeVisible();

  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByTestId('answered-count')).toHaveText('5');

  // Progress is one versioned document and survives a reload.
  await page.reload();
  await expect(page.getByTestId('answered-count')).toHaveText('5');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('margins.progress') ?? 'null'));
  expect(stored).toMatchObject({ version: 12 });

  // The app moves on to a skill not yet practised; the skills screen overrides its pick.
  await expect(page.getByTestId('next-skill')).not.toHaveText('Addition');
  await page.getByTestId('skills-entry').getByRole('button').click();
  await expect(page.getByTestId('skill-addition')).toContainText('5 answered');
  await page.getByTestId('skill-addition').getByRole('button').click();

  // Leaving part-way keeps credit for answers already given.
  await typeOnKeypad(page, String(await sumOnScreen(page)));
  await submit.click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByTestId('answered-count')).toHaveText('6');
  await page.reload();
  await expect(page.getByTestId('answered-count')).toHaveText('6');

  // Once the service worker has taken control, the app loads with no connection.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Margins' })).toBeVisible();
  await expect(page.getByTestId('answered-count')).toHaveText('6');
  await context.setOffline(false);
});

test('the keypad has no percent key, the sign key sits in the grid, and the unit waits on the board', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('skills-entry').getByRole('button').click();
  // Fraction conversions at tier 1 always asks for a percentage.
  await page.getByTestId('skill-fraction-conversions').getByRole('button').click();

  // Calculator order, delete top right, the sign key left of 0, the decimal point right of it, no percent key.
  const keypad = page.getByRole('group', { name: 'Keypad' });
  const names = await keypad.getByRole('button').evaluateAll((keys) => keys.map((key) => key.getAttribute('aria-label')));
  expect(names).toEqual(['7', '8', '9', 'Delete', '4', '5', '6', 'Thousand (k)', '1', '2', '3', 'Million (m)', 'Minus sign', '0', 'Decimal point', 'Billion (bn)']);
  await expect(page.getByRole('button', { name: 'Percent' })).toHaveCount(0);

  // The unit is on the board before anything is typed, and stays after the digits.
  const entry = page.getByTestId('entry');
  await expect(entry).toHaveText(/^=\s*%$/);
  await keypad.getByRole('button', { name: '5', exact: true }).tap();
  await keypad.getByRole('button', { name: '0', exact: true }).tap();
  // Each touch types exactly once.
  await expect(entry).toHaveText(/^=\s*50\s*%$/);

  // A key activated from the keyboard (focus plus Space) types once too.
  await keypad.getByRole('button', { name: '0', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(entry).toHaveText(/^=\s*500\s*%$/);
  // Enter on a focused key types that key once, and does not submit.
  await page.keyboard.press('Enter');
  await expect(entry).toHaveText(/^=\s*5000\s*%$/);
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();

  // The sign key works from the grid; a hardware percent key adds nothing.
  await keypad.getByRole('button', { name: 'Minus sign' }).tap();
  await page.keyboard.type('%');
  await expect(entry).toHaveText(/^=\s*−5000\s*%$/);
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();

  // A key types as the thumb lands: a thumb that slides off before lifting still types it.
  const touch = { isPrimary: true, button: 0, pointerType: 'touch' };
  await keypad.getByRole('button', { name: 'Delete' }).dispatchEvent('pointerdown', touch);
  await expect(entry).toHaveText(/^=\s*−500\s*%$/);

  // A press the browser cancels, or one lifted off its key, brings no click of its own: a later click on the key still types.
  const five = keypad.getByRole('button', { name: '5', exact: true });
  await five.dispatchEvent('pointerdown', touch);
  await five.dispatchEvent('pointercancel', touch);
  await five.dispatchEvent('click', { detail: 1 });
  await expect(entry).toHaveText(/^=\s*−50055\s*%$/);
  await five.dispatchEvent('pointerdown', touch);
  await page.locator('body').dispatchEvent('pointerup', { ...touch, clientX: 1, clientY: 1 });
  await five.dispatchEvent('click', { detail: 1 });
  await expect(entry).toHaveText(/^=\s*−5005555\s*%$/);

  // A sprint shows the unit the same way.
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByTestId('skills-entry').getByRole('button').click();
  await page.getByRole('button', { name: 'Sprint', exact: true }).click();
  await page.getByTestId('sprint-fraction-conversions').getByRole('button').click();
  await page.getByRole('button', { name: 'Start sprint' }).click();
  await expect(page.getByTestId('entry')).toHaveText(/^=\s*%$/);
});

test('a sprint takes a right answer the moment it is typed, and Skip moves on', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('skills-entry').getByRole('button').click();
  await page.getByRole('button', { name: 'Sprint', exact: true }).click();
  await page.getByTestId('sprint-addition').getByRole('button').click();
  await page.getByRole('button', { name: 'Start sprint' }).click();

  const score = page.getByTestId('sprint-score');
  const signal = page.getByTestId('sprint-last');
  const prompt = page.getByTestId('prompt');
  const entry = page.getByTestId('entry');
  const skip = page.getByRole('button', { name: 'Skip' });
  await expect(score).toHaveText('0');

  // The bottom button reads Skip, not Submit, and works before anything is typed.
  await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  await expect(skip).toBeEnabled();

  // The right answer on the keypad is taken on its last digit: no other press.
  let shown = (await prompt.textContent())!;
  await typeOnKeypad(page, String(await sumOnScreen(page)));
  await expect(score).toHaveText('1');
  await expect(signal).toHaveText('Last one: correct');
  await expect(prompt).not.toHaveText(shown);
  await expect(entry).toHaveText(/^=\s*$/);

  // Typing on a hardware keyboard is taken the same way.
  shown = (await prompt.textContent())!;
  await page.keyboard.type(String(await sumOnScreen(page)));
  await expect(score).toHaveText('2');
  await expect(prompt).not.toHaveText(shown);

  // Skip with nothing typed: the next drill, the score unchanged, the answer in the signal.
  shown = (await prompt.textContent())!;
  const skipped = await sumOnScreen(page);
  await skip.click();
  await expect(signal).toHaveText(`Last one: missed, it was ${new Intl.NumberFormat('en-US').format(skipped)}`);
  await expect(score).toHaveText('2');
  await expect(prompt).not.toHaveText(shown);

  // A wrong number stays on the board. Enter on a focused key types that key once, and does not skip.
  shown = (await prompt.textContent())!;
  const wrong = String((await sumOnScreen(page)) + 1);
  await typeOnKeypad(page, wrong.slice(0, -1));
  await page.getByRole('group', { name: 'Keypad' }).getByRole('button', { name: wrong.slice(-1), exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(entry).toHaveText(new RegExp(`^=\\s*${wrong}$`));
  await expect(prompt).toHaveText(shown);
  await expect(score).toHaveText('2');
  // Enter anywhere else does what the bottom button does, and skips it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(prompt).not.toHaveText(shown);
  await expect(signal).toContainText('Last one: missed');
  await expect(score).toHaveText('2');
});

test('a sprint takes nothing once its time is up, even before the clock catches up', async ({ page }) => {
  // Timers only run when the test says, so the deadline can pass before the countdown's next tick.
  const start = new Date('2026-03-02T09:00:00Z').getTime();
  await page.clock.install({ time: start });
  await page.goto('/');
  await page.getByTestId('skills-entry').getByRole('button').click();
  await page.getByRole('button', { name: 'Sprint', exact: true }).click();
  await page.getByTestId('sprint-addition').getByRole('button').click();
  const begun = start + 10 * 60_000;
  await page.clock.pauseAt(begun);
  await page.getByRole('button', { name: 'Start sprint' }).dispatchEvent('click');
  await expect(page.getByTestId('sprint-score')).toHaveText('0');
  // Let the screen's effects run: the keyboard listener and the countdown start after paint.
  await page.clock.runFor(50);

  // Just past the deadline, with no tick since: a right answer and a skip are both refused.
  await page.clock.setSystemTime(begun + 60_050);
  await page.keyboard.type(String(await sumOnScreen(page)));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('sprint-score')).toHaveText('0');
  await expect(page.getByTestId('sprint-last')).toHaveText('Go.');

  // The next tick ends it with nothing counted.
  await page.clock.runFor(200);
  await expect(page.getByTestId('sprint-result-score')).toHaveText('0');
  await expect(page.getByText('Attempted', { exact: true }).locator('..')).toHaveText(/Attempted\s*0$/);
});

/** Tap option A and submit, whatever the question. */
async function answerA(page: Page) {
  await page.getByRole('group', { name: 'Options' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status')).toContainText(/Correct|Not quite/);
}

/** The last session record saved. */
async function lastSession(page: Page) {
  return page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('margins.progress') ?? 'null');
    return progress.sessions.at(-1);
  });
}

test('a spot check keeps the skill back until the answer is in, resumes after a reload, and ends on its own summary', async ({ page }) => {
  await page.goto('/');
  const label = page.getByTestId('question-label');

  // One question: no tally, no count, and no skill named until it is answered.
  await page.getByRole('button', { name: 'Spot check · 1' }).click();
  await expect(page.getByTestId('spot-check-bar')).toHaveText('Spot check · 1 question');
  await expect(page.getByRole('list', { name: 'Question 1 of 1' })).toHaveCount(0);
  await expect(page.getByText('1/1', { exact: true })).toHaveCount(0);
  await expect(label).toHaveText('Spot check · pick one');
  await answerA(page);
  await expect(label).toHaveText(/^Spot check · \S/);
  await expect(label).not.toContainText('pick one');
  await page.getByRole('button', { name: 'See summary' }).click();

  await expect(page.getByText('Spot check done')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText(/^[01]\/1$/);
  await expect(page.getByTestId('target-time')).toBeVisible();
  await expect(page.getByTestId('test-level')).toContainText(/1 of \d+ seen/);
  expect(await lastSession(page)).toMatchObject({ questionCount: 1, spotCheck: true });
  await expect(page.getByRole('button', { name: 'Another question' })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByTestId('answered-count')).toHaveText('1');

  // Three questions: the tally and count as in a session.
  await page.getByRole('button', { name: 'Spot check · 3' }).click();
  await expect(page.getByRole('list', { name: 'Question 1 of 3' })).toBeVisible();
  await expect(page.getByText('1/3', { exact: true })).toBeVisible();
  await expect(label).toHaveText('Spot check · pick one');
  await answerA(page);

  // A reload part-way picks up at the next question, still a spot check.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Question 2 of 3' })).toBeVisible();
  await expect(label).toHaveText('Spot check · pick one');
  await answerA(page);
  await page.getByRole('button', { name: 'Next question' }).click();
  await answerA(page);

  // A reload after the last answer finishes it: the summary, and a record marked as a spot check.
  await page.reload();
  await expect(page.getByText('Spot check done')).toBeVisible();
  await expect(page.getByText('Per question', { exact: true })).toBeVisible();
  expect(await lastSession(page)).toMatchObject({ questionCount: 3, spotCheck: true });
  await expect(page.getByRole('button', { name: 'Another spot check' })).toBeVisible();

  // Another spot check is the same length; Leave goes Home.
  await page.getByRole('button', { name: 'Another spot check' }).click();
  await expect(page.getByRole('list', { name: 'Question 1 of 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByTestId('answered-count')).toHaveText('4');
});
