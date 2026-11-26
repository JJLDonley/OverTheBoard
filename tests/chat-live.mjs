// Real Social Stream relay test; uses a unique session, never the production chat.
// deno run -A --no-lock tests/chat-live.mjs
import { chromium } from 'npm:playwright@1.63.0';
const session = `OverlayTest${crypto.randomUUID().replaceAll('-', '')}`;
const browser = await chromium.launch({executablePath:Deno.env.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') || '/home/sensui/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']});
let socket;
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const url=new URL(Deno.env.get('OVERLAY_TEST_URL') || 'http://127.0.0.1:8765/');
 url.search=new URLSearchParams({role:'CO',label:'Chat test',Network:session,chatSession:session,Chat:encodeURIComponent(`https://socialstream.ninja/dock.html?session=${session}&hidemenu&server&server2&server3`)}).toString();
 await page.goto(url.href,{waitUntil:'domcontentloaded'});
 const dock=await (await page.locator('#chat').elementHandle()).contentFrame();
 const featured=await (await page.locator('#featuredChat').elementHandle()).contentFrame();
 await dock.waitForFunction(()=>typeof socketserver!=='undefined' && socketserver?.readyState===1,{},{timeout:45000});
 await featured.waitForLoadState('domcontentloaded');
 socket=new WebSocket('wss://io.socialstream.ninja/api');
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;setTimeout(()=>reject(Error('Relay connection timeout')),15000);});
 socket.send(JSON.stringify({join:session,out:1,in:9}));
 await page.waitForTimeout(2000);
 const send=async(id,text)=>{
  socket.send(JSON.stringify({id,chatname:'Overlay Test',chatmessage:text,type:'youtube',textonly:true}));
  await dock.getByText(text,{exact:true}).waitFor({timeout:20000});
  console.log('PASS: message received through Social Stream relay');
  await dock.getByText(text,{exact:true}).click();
  await page.locator('#dismissFeaturedChat').waitFor({state:'visible',timeout:20000});
  await featured.getByText(text,{exact:true}).waitFor({timeout:15000});
  console.log('PASS: clicking chat displays the real featured message and dismiss X');
  return Date.now();
 };
 await send(910001,'This is a real highlighted chat message that you can dismiss using the X beside it.');
 await page.screenshot({path:'/home/sensui/Projects/view/overlay-chat-live.png'});
 await page.locator('#dismissFeaturedChat').click();
 await page.waitForFunction(()=>getComputedStyle(document.getElementById('featuredChat')).visibility==='hidden' && document.getElementById('dismissFeaturedChat').hidden);
 console.log('PASS: dismiss hides popup and X');
 for (const [id,text] of [[910002,'Hello board'],[910003,'This message has exactly eight words for testing'],[910004,'This longer message contains twenty words so it should remain visible for five seconds before automatically clearing the board feed']]) {
  const started=await send(id,text);
  const expected=Math.max(1000,text.split(/\s+/).length*250);
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('featuredChat')).visibility==='hidden' && document.getElementById('dismissFeaturedChat').hidden,{},{timeout:expected+3000});
  const elapsed=Date.now()-started;
  if(Math.abs(elapsed-expected)>600) throw Error(`Timing mismatch: expected ${expected}ms, observed ${elapsed}ms`);
  console.log(`PASS: ${text.split(/\s+/).length} words, ${elapsed}ms visible (expected ${expected}ms)`);
 }
 const bounds=await page.locator('#featuredChat').boundingBox();
 if(bounds.width>560)throw Error('Popup too wide');
 console.log('PASS: compact popup width '+bounds.width);
 console.log('Screenshot: view/overlay-chat-live.png');
} finally {socket?.close();await browser.close();}
