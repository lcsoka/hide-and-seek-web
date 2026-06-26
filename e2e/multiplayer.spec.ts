import { APIRequestContext, Browser, Page, expect, request, test } from '@playwright/test';

/**
 * A full host + seeker game played automatically across two independent browser contexts
 * (two real players), driven through the backend API while ASSERTING the live UI of both
 * clients — so it covers realtime sync (joins, questions, answers) and the frontend, not
 * just the engine (that's `php artisan game:simulate`).
 */
const API = 'http://hide-and-seek.test/api';

async function ctx(token?: string): Promise<APIRequestContext> {
  return request.newContext({ extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function guest(name: string): Promise<string> {
  const c = await ctx();
  const r = await c.post(`${API}/auth/guest`, { data: { display_name: name } });
  expect(r.ok(), 'guest auth').toBeTruthy();

  return (await r.json()).token;
}

async function act(token: string, sessionId: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
  const c = await ctx(token);
  const r = await c.post(`${API}/sessions/${sessionId}/actions`, { data: { type, payload } });
  expect(r.ok(), `action ${type} (${r.status()})`).toBeTruthy();
}

async function setPosition(token: string, sessionId: string, lat: number, lng: number): Promise<void> {
  const c = await ctx(token);
  await c.post(`${API}/sessions/${sessionId}/location`, { data: { lat, lng } });
}

/** Open the session UI as a specific player (dev `?token=&player=` identity override). */
async function openAs(browser: Browser, sessionId: string, token: string, playerId: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/s/${sessionId}?token=${encodeURIComponent(token)}&player=${playerId}`);

  return page;
}

test('two players play a full game and both UIs stay in sync', async ({ browser }) => {
  // --- Host creates the game ---
  const hostToken = await guest('Host');
  const create = await (await ctx(hostToken)).post(`${API}/sessions`, {
    data: { city: 'budapest', game_size: 'small', config: { rounds: 1 }, display_name: 'Host' },
  });
  expect(create.ok(), 'create session').toBeTruthy();
  const session = await create.json();
  const sessionId: string = session.id;

  const hostPage = await openAs(browser, sessionId, hostToken, session.host_player_id);
  await expect(hostPage.getByText('Waiting room')).toBeVisible();

  // --- A seeker joins → the host's lobby must update LIVE (no refresh) ---
  const seekerToken = await guest('Seeker');
  const join = await (await ctx(seekerToken)).post(`${API}/sessions/${session.join_code}/join`, { data: { display_name: 'Seeker' } });
  expect(join.ok(), 'join').toBeTruthy();
  const seekerId: string = (await join.json()).player.id;

  await expect(hostPage.getByText('Seeker'), 'host sees the seeker join live').toBeVisible();

  const seekerPage = await openAs(browser, sessionId, seekerToken, seekerId);
  await expect(seekerPage.getByText('Waiting room')).toBeVisible();

  // --- Host starts + assigns themselves the hider (via the real UI) ---
  await hostPage.getByRole('button', { name: 'Start game' }).click();
  await expect(hostPage.getByText('Choose the hider')).toBeVisible();
  await expect(seekerPage.getByText(/Waiting for the host/i), 'seeker advances live').toBeVisible();

  await hostPage.getByRole('button', { name: 'Make hider' }).first().click();

  // --- Hide on a spot + commit (API: positions/station need no Overpass here) ---
  await setPosition(hostToken, sessionId, 47.4979, 19.0402);
  await act(hostToken, sessionId, 'choose_station', { lat: 47.4979, lng: 19.0402 });
  await act(hostToken, sessionId, 'confirm_hidden');

  await expect(seekerPage.getByRole('button', { name: /Ask a question/i }), 'seeker can ask once seeking').toBeVisible();

  // --- Seeker asks a radar question → the hider must see it live ---
  const catalog = await (await ctx(seekerToken)).get(`${API}/questions`);
  const radar = (await catalog.json()).find((q: any) => q.category === 'radar');
  await setPosition(seekerToken, sessionId, 47.55, 19.10);
  await act(seekerToken, sessionId, 'ask_question', { question_id: radar.id, radius_m: 5000 });

  await expect(hostPage.getByRole('button', { name: /Confirm answer/i }), 'hider sees the pending question live').toBeVisible();

  // --- Hider answers → the seeker's history/map updates live ---
  await act(hostToken, sessionId, 'answer_question', {});
  await expect(seekerPage.getByText(/within|beyond/i).first(), 'seeker sees the answered radar clue live').toBeVisible();

  // --- Seeker closes in and catches the hider → round ends for both ---
  await act(seekerToken, sessionId, 'declare_endgame');
  await setPosition(seekerToken, sessionId, 47.4979, 19.0402);
  await act(seekerToken, sessionId, 'confirm_found');

  await expect(seekerPage.getByText(/Round over|Game over/i)).toBeVisible();
  await expect(hostPage.getByText(/Round over|Game over/i)).toBeVisible();
});
