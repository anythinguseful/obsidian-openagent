const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 720 } });
  const target = process.argv[2] || 'index.html';
  await p.goto('file://' + process.cwd() + '/preview/' + target);
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'test/ui-preview.png' });
  // usage: node test/shot.cjs [preview-file.html]
  await b.close();
  console.log('ok');
})().catch(e => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
