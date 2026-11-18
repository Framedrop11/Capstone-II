import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { By, Builder, Select, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const baseUrl = (
  process.env['CARELENS_E2E_BASE_URL'] ?? 'http://host.docker.internal:18082'
).replace(/\/$/, '');
const publicOnly = process.env['CARELENS_E2E_PUBLIC_ONLY'] === 'true';
const fullMatrix = [
  {
    browser: 'chrome',
    url: process.env['SELENIUM_CHROME_URL'] ?? 'http://localhost:4444',
    width: 1440,
    height: 1000,
  },
  {
    browser: 'firefox',
    url: process.env['SELENIUM_FIREFOX_URL'] ?? 'http://localhost:4445',
    width: 1440,
    height: 1000,
  },
  {
    browser: 'chrome',
    url: process.env['SELENIUM_CHROME_URL'] ?? 'http://localhost:4444',
    width: 390,
    height: 844,
  },
  {
    browser: 'firefox',
    url: process.env['SELENIUM_FIREFOX_URL'] ?? 'http://localhost:4445',
    width: 390,
    height: 844,
  },
];
const selectedRuns = process.env['CARELENS_E2E_RUNS']?.split(',').filter(Boolean);
const matrix = selectedRuns?.length
  ? fullMatrix.filter((entry) =>
      selectedRuns.includes(`${entry.browser}-${entry.width === 390 ? 'mobile' : 'desktop'}`),
    )
  : fullMatrix;
const failures = [];

function createDriver(config) {
  const options = config.browser === 'chrome' ? new chrome.Options() : new firefox.Options();
  if (config.browser === 'chrome') {
    options.addArguments(
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
    );
    options.set('goog:loggingPrefs', { browser: 'ALL', performance: 'ALL' });
  } else {
    options.addArguments('-headless');
  }
  const builder = new Builder().usingServer(config.url).forBrowser(config.browser);
  if (config.browser === 'chrome') builder.setChromeOptions(options);
  else builder.setFirefoxOptions(options);
  return builder.build();
}

async function assertAxe(driver, label) {
  await driver.executeScript(axeSource);
  const result = await driver.executeAsyncScript(
    'const done = arguments[arguments.length - 1]; window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then(done);',
  );
  const summary = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(', ')),
  }));
  assert.deepEqual(summary, [], `${label} axe violations: ${JSON.stringify(summary)}`);
}

async function assertNoOverflow(driver, label) {
  const sizes = await driver.executeScript(
    'return { viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth };',
  );
  assert.ok(
    sizes.content <= sizes.viewport + 1,
    `${label} horizontal overflow: ${JSON.stringify(sizes)}`,
  );
}

async function beginNetworkAndPrivacyChecks(driver) {
  await driver.executeScript(`
    window.__careLensE2E = { requests: [] };
    window.__careLensE2E.consoleErrors = [];
    window.addEventListener('error', (event) => window.__careLensE2E.consoleErrors.push(event.message || 'uncaught error'));
    window.addEventListener('unhandledrejection', (event) => window.__careLensE2E.consoleErrors.push(String(event.reason)));
    const originalConsoleError = console.error.bind(console);
    console.error = (...args) => { window.__careLensE2E.consoleErrors.push(args.map(String).join(' ')); originalConsoleError(...args); };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const request = args[0] instanceof Request ? args[0].url : String(args[0]);
      const path = new URL(request, location.href).pathname;
      try {
        const response = await originalFetch(...args);
        window.__careLensE2E.requests.push({ path, status: response.status });
        return response;
      } catch (error) {
        window.__careLensE2E.requests.push({ path, failed: String(error) });
        throw error;
      }
    };
  `);
}

async function assertNoUnexpectedResponses(driver, label) {
  const requests = await driver.executeScript('return window.__careLensE2E?.requests ?? [];');
  const unexpected = requests.filter(
    (entry) =>
      entry.failed ||
      (entry.status >= 400 &&
        !(entry.status === 401 && entry.path === '/api/v1/auth/refresh') &&
        !(entry.status === 409 && entry.path.startsWith('/api/v1/doctor/reports/'))),
  );
  assert.deepEqual(
    unexpected,
    [],
    `${label} unexpected API responses: ${JSON.stringify(unexpected)}`,
  );
  const privacy = await driver.executeScript(`return {
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    url: location.href,
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
  };`);
  assert.equal(privacy.localStorage, 0, `${label} localStorage contains values`);
  assert.equal(privacy.sessionStorage, 0, `${label} sessionStorage contains values`);
  assert.ok(
    !/[?&](access_token|token|health|bmi|risk)=/i.test(privacy.url),
    `${label} URL contains sensitive-looking query data`,
  );
  const headers = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    fetch('/').then((response) => done({ csp: response.headers.get('content-security-policy'), nosniff: response.headers.get('x-content-type-options'), frame: response.headers.get('x-frame-options') }));
  `);
  assert.ok(headers.csp?.includes("default-src 'self'"), `${label} CSP header is missing`);
  assert.equal(headers.nosniff, 'nosniff', `${label} MIME sniffing header missing`);
  assert.ok(headers.frame, `${label} frame protection header missing`);
}

async function assertNoConsoleErrors(driver, label) {
  const tracked = await driver
    .executeScript('return window.__careLensE2E?.consoleErrors ?? [];')
    .catch(() => []);
  assert.deepEqual(tracked, [], `${label} uncaught JavaScript or console errors`);
  try {
    const entries = await driver.manage().logs().get('browser');
    const errors = entries.filter((entry) => entry.level.name === 'SEVERE');
    assert.deepEqual(
      errors.map((entry) => entry.message),
      [],
      `${label} browser console errors`,
    );
  } catch (error) {
    if (String(error).includes('not supported') || String(error).includes('Log type')) return;
    throw error;
  }
}

async function signIn(driver, role) {
  await driver.get(baseUrl);
  await driver.wait(until.elementLocated(By.css('#public-title')), 15_000);
  // A prior run can leave an authenticated route open while the app's stored
  // session is being restored. Reuse that session only when it matches role.
  if (new URL(await driver.getCurrentUrl()).pathname === `/${role}`) {
    await beginNetworkAndPrivacyChecks(driver);
    return;
  }
  const roleSelect = await driver.findElements(By.id('demo-role'));
  if (roleSelect.length) await new Select(roleSelect[0]).selectByValue(role);
  const signInButton = await driver.wait(until.elementLocated(By.css('.cl-google-button')), 15_000);
  await driver.wait(until.elementIsEnabled(signInButton), 5_000);
  await signInButton.click();
  await driver.wait(until.urlContains(`/${role}`), 15_000);
  await driver.wait(async (current) => (await current.getAllWindowHandles()).length === 1, 5_000);
  await beginNetworkAndPrivacyChecks(driver);
}

async function completeCheckup(driver) {
  await driver.findElement(By.xpath("//button[contains(., 'Start a new check-up')]")).click();
  const answers = [
    ['ageYears', '40'],
    ['bmi', '24'],
    ['waistCm', '78'],
    ['sex', 'female'],
    ['activity30MinDaily', 'true'],
    ['fruitVegetablesDaily', 'true'],
    ['antihypertensiveTreatment', 'false'],
    ['historyHighGlucose', 'false'],
    ['familyHistoryDiabetes', 'none'],
  ];
  for (let index = 0; index < answers.length; index += 1) {
    const [name, value] = answers[index];
    if (index < 3) {
      const input = await driver.findElement(By.id(`field-${name}`));
      await input.clear();
      await input.sendKeys(value);
    } else {
      await driver.findElement(By.css(`input[type="radio"][value="${value}"]`)).click();
    }
    if (index === 0) {
      await assertAxe(driver, 'patient check-up');
      await assertNoOverflow(driver, 'patient check-up');
    }
    await driver
      .findElement(
        By.xpath(
          `//button[normalize-space()='${index === answers.length - 1 ? 'Get my estimate' : 'Continue'}']`,
        ),
      )
      .click();
  }
  try {
    await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[contains(normalize-space(), 'A starting point for a conversation') or contains(normalize-space(), 'Your estimate is ready')]",
        ),
      ),
      90_000,
    );
  } catch (error) {
    const diagnostic = await driver.executeScript(`return {
      url: location.pathname,
      requests: window.__careLensE2E?.requests?.map(({path,status,failed}) => ({path,status,failed: Boolean(failed)})) ?? [],
      statusText: document.querySelector('[role="status"]')?.textContent ?? null,
      alertPresent: Boolean(document.querySelector('[role="alert"]')),
    };`);
    process.stderr.write(`Questionnaire diagnostic: ${JSON.stringify(diagnostic)}\n`);
    throw error;
  }
  await assertAxe(driver, 'patient report');
  await assertNoOverflow(driver, 'patient report');
}

async function shareWithDoctor(driver) {
  const share = await driver.findElements(By.xpath("//button[contains(., 'Share with a doctor')]"));
  if (share.length) await share.at(-1).click();
  else await driver.findElement(By.css('.patient-nav button:nth-child(3)')).click();
  await driver.wait(until.elementLocated(By.id('doctor-search')), 10_000);
  await driver.wait(
    async () => (await driver.findElements(By.css('.doctor-results button'))).length > 0,
    15_000,
  );
  await driver.findElement(By.css('.doctor-results button')).click();
  await driver.findElement(By.xpath("//button[normalize-space()='Share this report']")).click();
  await driver.wait(
    until.elementLocated(By.xpath("//*[contains(., 'Report access is now active')]")),
    15_000,
  );
  await assertAxe(driver, 'patient sharing');
  await driver.findElement(By.css('.patient-nav button:nth-child(4)')).click();
  await assertAxe(driver, 'patient activity');
  await driver.findElement(By.css('.patient-nav button:nth-child(3)')).click();
}

async function openDoctorReport(driver) {
  const notification = await driver.wait(
    until.elementLocated(By.xpath("//button[normalize-space()='Open shared report']")),
    20_000,
  );
  await notification.click();
  await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'Access ends in')]")), 15_000);
  await assertAxe(driver, 'doctor report opened from notification');
  await driver
    .findElement(By.id('outcome-note'))
    .sendKeys('Synthetic follow-up outcome recorded in the local demo.');
  await driver.findElement(By.xpath("//button[normalize-space()='Record outcome']")).click();
  await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'Outcome recorded')]")), 15_000);
}

async function revokeShare(driver) {
  await driver.findElement(By.css('.patient-nav button:nth-child(3)')).click();
  await driver.wait(
    until.elementLocated(By.xpath("//button[normalize-space()='Revoke access']")),
    10_000,
  );
  await driver.findElement(By.xpath("//button[normalize-space()='Revoke access']")).click();
  await driver.findElement(By.xpath("//button[normalize-space()='Confirm revoke']")).click();
  await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'No active shares')]")), 15_000);
}

async function runFullJourney(config) {
  const patient = await createDriver(config);
  const doctorConfig = { ...config };
  let doctor;
  try {
    doctor = await createDriver(doctorConfig);
    await Promise.all([
      patient.manage().setTimeouts({ pageLoad: 60_000, script: 30_000 }),
      doctor.manage().setTimeouts({ pageLoad: 60_000, script: 30_000 }),
    ]);
    await Promise.all([
      patient.manage().window().setRect({ width: config.width, height: config.height }),
      doctor.manage().window().setRect({ width: config.width, height: config.height }),
    ]);
    await signIn(patient, 'patient');
    await assertAxe(patient, 'patient dashboard');
    await assertNoOverflow(patient, 'patient dashboard');
    await completeCheckup(patient);
    await shareWithDoctor(patient);
    await assertNoUnexpectedResponses(patient, 'patient flow');

    await signIn(doctor, 'doctor');
    await doctor.get(`${baseUrl}/admin`);
    await doctor.wait(until.urlContains('/forbidden'), 10_000);
    await doctor.get(`${baseUrl}/doctor`);
    await assertAxe(doctor, 'doctor worklist');
    await assertNoOverflow(doctor, 'doctor worklist');
    await openDoctorReport(doctor);
    await patient.findElement(By.xpath("//button[normalize-space()='Sign out']")).click();
    await patient.wait(until.urlIs(`${baseUrl}/`), 10_000);
    await signIn(patient, 'patient');
    await revokeShare(patient);
    await doctor.wait(
      until.elementLocated(By.xpath("//h2[normalize-space()='Access has ended']")),
      25_000,
    );
    await assertAxe(doctor, 'doctor access ended');
    await assertNoUnexpectedResponses(doctor, 'doctor flow');

    await patient.findElement(By.xpath("//button[normalize-space()='Sign out']")).click();
    await patient.wait(until.urlIs(`${baseUrl}/`), 10_000);
    await signIn(patient, 'admin');
    await assertAxe(patient, 'admin dashboard');
    await assertNoOverflow(patient, 'admin dashboard');
    const userSearch = await patient.findElement(By.css('input[placeholder="Name, email or ID"]'));
    await userSearch.sendKeys('<img src=x onerror=alert(1)>');
    assert.equal(
      await patient.findElements(By.css('img[src="x"]')).then((items) => items.length),
      0,
      'admin search rendered an XSS probe',
    );
    await patient.get(`${baseUrl}/patient`);
    await patient.wait(until.urlContains('/forbidden'), 10_000);
    await assertAxe(patient, 'forbidden route');
    await assertNoUnexpectedResponses(patient, 'admin flow');
    await assertNoConsoleErrors(patient, `${config.browser}/${config.width} admin`);
    await assertNoConsoleErrors(doctor, `${config.browser}/${config.width} doctor`);
    process.stdout.write(
      `PASS ${config.browser} ${config.width}x${config.height}: patient check-up/share/revoke, doctor access countdown/outcome/revocation, admin and forbidden-route, axe, privacy, CSP, console/network checks\n`,
    );
  } finally {
    await Promise.allSettled([patient.quit(), ...(doctor ? [doctor.quit()] : [])]);
  }
}

async function runPublicSmoke(config) {
  const driver = await createDriver(config);
  try {
    await driver.manage().window().setRect({ width: config.width, height: config.height });
    await driver.get(baseUrl);
    await driver.wait(
      until.elementLocated(By.xpath("//button[normalize-space()='Sign in with Google']")),
      15_000,
    );
    await assertAxe(driver, 'public landing');
    await assertNoOverflow(driver, 'public landing');
    await assertNoConsoleErrors(driver, `${config.browser}/${config.width} public`);
    process.stdout.write(
      `PASS ${config.browser} ${config.width}x${config.height}: public landing axe and responsive smoke\n`,
    );
  } finally {
    await driver.quit();
  }
}

for (const config of matrix) {
  try {
    if (publicOnly) await runPublicSmoke(config);
    else await runFullJourney(config);
  } catch (error) {
    failures.push(`${config.browser} ${config.width}x${config.height}: ${error.stack ?? error}`);
    process.stderr.write(
      `FAIL ${config.browser} ${config.width}x${config.height}: ${error.message ?? error}\n`,
    );
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n\n')}\n`);
  process.exitCode = 1;
}
