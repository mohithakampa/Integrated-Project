import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outputDir = path.join(root, 'deliverables')
const rawDir = path.join(outputDir, 'raw')
const base = process.env.GAME_URL ?? 'http://127.0.0.1:3000'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const browserCandidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
const { existsSync } = await import('node:fs')
const executablePath = browserCandidates.find(existsSync)
assert.ok(executablePath, 'Chromium was not found')
await mkdir(rawDir, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
})
await context.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
  const nativeConnect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = nativeConnect.call(this, destination, ...rest)
    if (destination === this.context.destination && !window.__ktzCaptureStream) {
      const tap = this.context.createMediaStreamDestination()
      nativeConnect.call(this, tap)
      window.__ktzCaptureDestination = tap
      window.__ktzCaptureStream = tap.stream
    }
    return result
  }
})
const videoStartEpoch = Date.now()
const page = await context.newPage()
page.setDefaultTimeout(7000)
const audioPath = path.join(rawDir, 'game-audio.webm')
await page.exposeFunction('__saveKtzAudio', async base64 => {
  await writeFile(audioPath, Buffer.from(base64, 'base64'))
})
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.locator('.title-panel').waitFor({ state: 'visible' })
await page.addStyleTag({ content: `
  #ktz-film {position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:ManusCC0,ui-monospace,monospace;color:#edf3ef}
  #ktz-caption {position:absolute;left:36px;top:120px;min-width:240px;max-width:min(520px,65vw);padding:11px 16px 10px 14px;border-left:2px solid #62e7f2;background:linear-gradient(90deg,rgba(5,11,15,.9),rgba(5,11,15,.64));box-shadow:0 10px 30px rgba(0,0,0,.2);opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease}
  #ktz-caption.on {opacity:1;transform:translateY(0)}
  #ktz-caption b {display:block;font-size:10px;letter-spacing:.18em;color:#f1f4ed}
  #ktz-caption small {display:block;margin-top:5px;font-size:8px;letter-spacing:.12em;color:#8fdfe4}
  #ktz-claim {position:absolute;right:34px;bottom:48px;padding:8px 12px;border:1px solid rgba(98,231,242,.32);background:rgba(6,13,17,.78);color:#c9faff;font-size:8px;letter-spacing:.16em;opacity:0;transition:opacity .15s}
  #ktz-claim.on {opacity:1}
  #ktz-reticle {position:absolute;width:18px;height:18px;left:0;top:0;display:none;transform:translate(-50%,-50%);border:1px solid rgba(98,231,242,.88);border-radius:50%;box-shadow:0 0 12px rgba(98,231,242,.35)}
  #ktz-reticle:before,#ktz-reticle:after {content:'';position:absolute;background:rgba(227,250,249,.9)}
  #ktz-reticle:before {width:1px;height:28px;left:8px;top:-6px}
  #ktz-reticle:after {height:1px;width:28px;left:-6px;top:8px}
  #ktz-cover {position:absolute;inset:0;background:#05080d;opacity:0;transition:opacity .2s ease}
  #ktz-cover.on {opacity:1}
  #ktz-end {position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0;transition:opacity .4s ease;background:radial-gradient(ellipse at 50% 45%,rgba(8,18,23,.83),rgba(4,7,11,.94) 72%)}
  #ktz-end.on {opacity:1}
  #ktz-end-mark {width:28px;height:28px;margin-bottom:22px;border:1px solid rgba(98,231,242,.65);transform:rotate(45deg);box-shadow:0 0 34px rgba(98,231,242,.18)}
  #ktz-end-mark:after {content:'';display:block;width:8px;height:8px;margin:9px;background:#62e7f2;box-shadow:0 0 16px #62e7f2}
  #ktz-end h1 {margin:0;color:#f1f1e8;font:800 54px/.95 ManusCC0,system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 8px 30px #000}
  #ktz-end h1 em {color:#f2545d;font-style:normal}
  #ktz-end p {margin:18px 0 0;color:#9fb1b2;font-size:10px;letter-spacing:.25em}
  #ktz-end small {margin-top:34px;color:#62e7f2;font-size:8px;letter-spacing:.24em}
  body,#game {cursor:none!important}
` })
await page.evaluate(() => {
  const film = document.createElement('div')
  film.id = 'ktz-film'
  film.innerHTML = '<div id="ktz-caption"><b></b><small></small></div><div id="ktz-claim"></div><div id="ktz-reticle"></div><div id="ktz-cover"></div><div id="ktz-end"><div id="ktz-end-mark"></div><h1>KILL THE <em>ZOMBIES</em></h1><p>FOUR LEVELS · UNLIMITED AMMUNITION</p><small>CAMPAIGN COMPLETE — LEVEL 4</small></div>'
  document.body.appendChild(film)
})
const setCaption = (title, detail = '') => page.evaluate(({ title, detail }) => {
  const box = document.querySelector('#ktz-caption')
  box.querySelector('b').textContent = title
  box.querySelector('small').textContent = detail
  box.classList.toggle('on', Boolean(title))
}, { title, detail })
const setClaim = text => page.evaluate(value => {
  const el = document.querySelector('#ktz-claim')
  el.textContent = value
  el.classList.toggle('on', Boolean(value))
}, text)
const holdUntil = async ms => {
  const left = ms - (Date.now() - captureStart)
  if (left > 0) await pause(left)
}
const waitScreen = async screen => page.waitForFunction(value => window.__killTheZombiesTest?.snapshot()?.screen === value, screen)
const clickAction = async action => page.locator(`[data-action="${action}"]`).first().click()
const position = async x => page.evaluate(worldX => window.__killTheZombiesTest.setPosition(worldX), x)
const keyTap = async code => page.keyboard.press(code)
const aimAt = async point => {
  const scale = Math.min(1280 / 960, 720 / 540)
  const x = (1280 - 960 * scale) / 2 + point.x * scale
  const y = (720 - 540 * scale) / 2 + point.y * scale
  await page.mouse.move(x, y)
  await page.evaluate(({ x, y }) => {
    const reticle = document.querySelector('#ktz-reticle')
    reticle.style.left = `${x}px`
    reticle.style.top = `${y}px`
    reticle.style.display = 'block'
  }, { x, y })
}
const shootAtEnemy = async id => {
  const point = await page.evaluate(enemyId => window.__killTheZombiesTest.enemyPoint(enemyId), id)
  if (!point) return
  await aimAt(point)
  await page.mouse.down()
  await pause(260)
  await page.mouse.up()
}

// Unlock the game's own procedural Web Audio on the title screen, then record that real game audio.
await page.keyboard.press('Shift')
await page.waitForFunction(() => Boolean(window.__ktzCaptureStream), null, { timeout: 5000 })
const audioStartEpoch = await page.evaluate(() => {
  const stream = window.__ktzCaptureStream
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
  window.__ktzAudioChunks = []
  recorder.addEventListener('dataavailable', event => { if (event.data.size) window.__ktzAudioChunks.push(event.data) })
  window.__ktzAudioRecorder = recorder
  recorder.start(250)
  return Date.now()
})
const pageVideo = page.video()
const captureStart = Date.now()

// 0–1.8s — let the actual title lockup land.
await holdUntil(1500)
await clickAction('play')
await waitScreen('intro')
await setCaption('2049 // NORTHSTAR CITY', 'THE OUTBREAK HAS ALREADY BEGUN')
await holdUntil(3000)
await clickAction('skip-intro')
await waitScreen('briefing')
await keyTap('Space')
await waitScreen('playing')

// 3.3–9s — Blood Zone: run, clear the road rubble, and fire the unlimited pistol.
await setCaption('01 / BLOOD ZONE', 'RUN · JUMP · FIRE')
await page.keyboard.down('KeyD')
await pause(430)
await page.keyboard.up('KeyD')
await page.keyboard.press('Space')
await page.keyboard.down('KeyD')
await pause(700)
await page.keyboard.up('KeyD')
await shootAtEnemy('l1-zombie-01')
await pause(420)
await shootAtEnemy('l1-zombie-01')
await setClaim('INFINITE AMMO · NO RELOADS')
await holdUntil(7500)

// 9–14.2s — Northstar Mall: a new indoor palette, a supply pickup, and live combat.
await page.evaluate(() => window.__killTheZombiesTest.setLevel(2))
await position(145)
await setCaption('02 / NORTHSTAR MALL', 'CONTAINMENT HAS FAILED')
await page.keyboard.down('KeyD')
await pause(320)
await page.keyboard.up('KeyD')
await keyTap('e')
await shootAtEnemy('l2-infected-01')
await page.mouse.down()
await pause(950)
await page.mouse.up()
await setClaim('SUPPLIES COLLECTED · WEAPONS STAY LOADED')
await holdUntil(11500)

// 14.2–19.4s — St. Agnes Hospital: recover field supplies in a clinical outbreak zone.
await page.evaluate(() => window.__killTheZombiesTest.setLevel(3))
await position(145)
await setCaption('03 / ST. AGNES HOSPITAL', 'THE SOURCE OF THE FEVER')
await page.keyboard.down('KeyD')
await pause(540)
await page.keyboard.up('KeyD')
await keyTap('e')
await shootAtEnemy('l3-infected-01')
await page.mouse.down()
await pause(780)
await page.mouse.up()
await holdUntil(15500)

// 19.4–27.0s — The Last Dawn: meet the origin boss with the rifle's true unlimited reserve.
await page.evaluate(() => document.querySelector('#ktz-cover').classList.add('on'))
await pause(230)
await page.evaluate(() => {
  const hooks = window.__killTheZombiesTest
  hooks.setLevel(4)
  hooks.clearNonBossEnemies()
  hooks.grantEnergy(2)
  hooks.setHealth(100)
  hooks.setAmmo('rifle', 0, 0)
})
await position(1220)
await keyTap('e')
await keyTap('e')
await keyTap('e')
await position(900)
await keyTap('e')
await keyTap('e')
await keyTap('e')
await position(1540)
await keyTap('e')
await keyTap('e')
await position(2290)
await keyTap('e')
await keyTap('4')
await page.evaluate(() => document.querySelector('#ktz-cover').classList.remove('on'))
await setCaption('04 / THE LAST DAWN', 'ORIGIN SITE · THE LAST THREAT')
await setClaim('ASSAULT RIFLE · AMMO 0 · STILL FIRING')
await pause(300)
const boss = await page.evaluate(() => window.__killTheZombiesTest.enemyPoint('l4-origin-boss'))
if (boss) await aimAt(boss)
await page.mouse.down()
while (Date.now() - captureStart < 26300) {
  const point = await page.evaluate(() => window.__killTheZombiesTest.enemyPoint('l4-origin-boss'))
  if (point) await aimAt(point)
  const state = await page.evaluate(() => window.__killTheZombiesTest.snapshot())
  if (state.screen === 'gameover' || state.bossDefeated) break
  await pause(170)
}
await page.mouse.up()
await setClaim('')
let state = await page.evaluate(() => window.__killTheZombiesTest.snapshot())
if (!state.bossDefeated && state.bossHp > 0) {
  await page.evaluate(hp => window.__killTheZombiesTest.damageEnemy('l4-origin-boss', hp), state.bossHp)
  await pause(420)
}
state = await page.evaluate(() => window.__killTheZombiesTest.snapshot())
if (state.bossDefeated && state.screen === 'playing') {
  await page.evaluate(() => document.querySelector('#ktz-cover').classList.add('on'))
  await pause(180)
  await position(3300)
  await keyTap('e')
  await page.waitForFunction(() => window.__killTheZombiesTest.snapshot().screen === 'campaign-complete', null, { timeout: 2500 }).catch(() => undefined)
  await page.evaluate(() => document.querySelector('#ktz-cover').classList.remove('on'))
}
state = await page.evaluate(() => window.__killTheZombiesTest.snapshot())
console.log('Level 4 ending capture state:', JSON.stringify({ screen: state.screen, bossDefeated: state.bossDefeated, bossHp: state.bossHp, neutralized: state.neutralized, terminals: state.terminals }))
if (state.screen !== 'campaign-complete' || !state.neutralized) throw new Error('The recorded ending did not reach the actual campaign-complete state.')
await holdUntil(27000)

// 27–30s — Hold the game's true Level 4 campaign ending under a quiet branded end card.
await setCaption('', '')
await page.evaluate(() => document.querySelector('#ktz-end').classList.add('on'))
await holdUntil(30000)

const audioSummary = await page.evaluate(() => new Promise(resolve => {
  const recorder = window.__ktzAudioRecorder
  recorder.addEventListener('stop', async () => {
    const blob = new Blob(window.__ktzAudioChunks, { type: recorder.mimeType })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    await window.__saveKtzAudio(btoa(binary))
    resolve({ mimeType: blob.type, bytes: blob.size })
  }, { once: true })
  recorder.stop()
}))
await page.close()
await context.close()
await browser.close()
const videoPath = await pageVideo.path()
const captureInfo = {
  requestedSeconds: 30,
  aspectRatio: '16:9',
  resolution: '1280x720',
  videoPath,
  audioPath,
  audioMimeType: audioSummary.mimeType,
  audioBytes: audioSummary.bytes,
  videoStartedAt: videoStartEpoch,
  audioStartedAt: audioStartEpoch,
  approximateVideoAudioOffsetMs: audioStartEpoch - videoStartEpoch,
}
await writeFile(path.join(outputDir, 'capture-info.json'), JSON.stringify(captureInfo, null, 2))
console.log(JSON.stringify(captureInfo, null, 2))
