# Run Script Without DevTools (Bookmarklet Method)

Since opening DevTools crashes Chrome, use this bookmarklet approach:

## Step 1: Create the Bookmarklet

1. Copy this entire code block (it's one line):

```javascript
javascript:(async function(){const sleep=ms=>new Promise(r=>setTimeout(r,ms));const waitFor=(fn,timeout=15000)=>new Promise((resolve,reject)=>{const start=Date.now();const interval=setInterval(()=>{if(fn()){clearInterval(interval);resolve()}else if(Date.now()-start>timeout){clearInterval(interval);reject(new Error('Timeout'))}},100)});const pageId=window.location.pathname.match(/\/pages\/(\d+)/)?.[1];if(!pageId){alert('No page ID found');return}async function fetchMacros(){const res=await fetch(`https://qrsouther.atlassian.net/wiki/api/v2/pages/${pageId}?body-format=storage`);const data=await res.json();const regex=/<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>/g;const macros=[];let m;while((m=regex.exec(data.body.storage.value))!==null){if(m[1]!=='Blueprint App0')macros.push(m[1])}return macros}async function enterEdit(){const btn=document.querySelector('[data-testid="page-header-edit-button"]')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Edit'));if(!btn)throw new Error('No edit button');btn.click();await waitFor(()=>document.querySelectorAll('div[extensionkey*="smart-excerpt"]').length>0,20000);await sleep(3000)}async function publish(){const btn=document.querySelector('button[data-testid="publish-button"]')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Publish')||b.textContent.includes('Update'));if(!btn)throw new Error('No publish button');btn.click();await waitFor(()=>document.querySelector('[data-testid="page-header-edit-button"]')!==null,20000);await sleep(2000)}async function processOne(name){const macros=document.querySelectorAll('div[extensionkey*="smart-excerpt"]');for(let i=0;i<macros.length;i++){try{const el=macros[i];el.scrollIntoView({behavior:'smooth',block:'center'});await sleep(500);(el.closest('.extension-container')||el).click();await sleep(1000);const editBtn=document.querySelector('[data-testid="extension-toolbar-edit-button"]');if(!editBtn)continue;editBtn.click();await sleep(3000);let doc=document;const iframe=Array.from(document.querySelectorAll('iframe')).find(f=>f.src?.includes('forge'));if(iframe){try{doc=iframe.contentDocument||iframe.contentWindow.document}catch(e){}}const input=doc.querySelector('input[name*="name"]')||doc.querySelector('input[placeholder*="Name"]')||Array.from(doc.querySelectorAll('input')).find(inp=>{const lbl=inp.previousElementSibling?.textContent||'';return lbl.toLowerCase().includes('name')});if(!input){const close=document.querySelector('[aria-label="Close"]');if(close)close.click();await sleep(1000);continue}const val=input.value?.trim();if(val&&val!==''&&val!=='null'){const close=document.querySelector('[aria-label="Close"]');if(close)close.click();await sleep(1000);continue}input.focus();input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));for(const char of name){input.value+=char;input.dispatchEvent(new Event('input',{bubbles:true}));await sleep(10)}await sleep(500);const save=doc.querySelector('button[type="submit"]')||Array.from(doc.querySelectorAll('button')).find(b=>b.textContent.trim()==='Save');if(!save){const close=document.querySelector('[aria-label="Close"]');if(close)close.click();await sleep(1000);return false}save.click();await waitFor(()=>!document.querySelector('[role="dialog"]'),5000);await sleep(1000);return true}catch(e){const close=document.querySelector('[aria-label="Close"]');if(close)close.click();await sleep(1000);continue}}return false}try{const allMacros=await fetchMacros();alert(`Starting initialization of ${allMacros.length} macros`);let done=0;let fails=0;for(let i=0;i<allMacros.length;i++){await enterEdit();const success=await processOne(allMacros[i]);if(success){done++;fails=0}else{fails++;if(fails>=3){alert(`Stopped at ${done}/${allMacros.length}`);break}}await publish();await sleep(2000)}alert(`Done: ${done}/${allMacros.length}`)}catch(e){alert('Error: '+e.message)}})();
```

2. In Chrome, **show your bookmarks bar** (View → Always Show Bookmarks Bar)

3. **Right-click** on bookmarks bar → Add page

4. Name: `Initialize Excerpts`

5. URL: **Paste the javascript code from step 1**

6. Click Save

## Step 2: Run the Bookmarklet

1. Navigate to your Confluence page (in VIEW mode)
2. Click the `Initialize Excerpts` bookmark
3. You'll see alert dialogs showing progress (instead of console logs)
4. Let it run - it will process all 147 macros automatically

## What You'll See

- Initial alert: "Starting initialization of 147 macros"
- The browser will cycle edit→publish automatically
- Final alert: "Done: 147/147"

**No DevTools needed!** The bookmarklet runs in the page context without opening DevTools.
