/*
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      const { apiKey } = await chrome.storage.sync.get('apiKey');
      if (!apiKey) {
        throw new Error('API key not found. Please set it in the options page.');
      }

      let prompt;
      const language = request.language || 'English';

      if (request.action === 'summarize') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.id) throw new Error('Could not get active tab.');
        if (activeTab.url?.startsWith('chrome://')) throw new Error('Cannot summarize Chrome internal pages.');

        // 1. Try to get selected text first
        const selectionInjection = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['selection.js'],
        });

        let pageText = '';
        if (selectionInjection && selectionInjection[0] && selectionInjection[0].result) {
          pageText = selectionInjection[0].result;
        }

        // 2. If no text is selected, fall back to Readability
        if (!pageText.trim()) {
          const readabilityInjection = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['Readability.js', 'content.js'],
          });

          if (!readabilityInjection || readabilityInjection.length === 0 || !readabilityInjection[0]) {
            throw new Error('Failed to inject content script into the page.');
          }
          pageText = readabilityInjection[0].result;
        }

        // 3. Handle cases where no content could be found by any method
        if (pageText === null || pageText === undefined || !pageText.trim()) {
          chrome.runtime.sendMessage({ type: 'summaryError', error: "Could not find any text on this page to summarize." });
          return;
        }

        prompt = `Summarize the text below in ${language}.
Focus on the key points and main ideas.
Keep it concise and easy to read.
Stay concise, use bullet points, don't bother to use full sentences.
No need for filler text, or introductory sentence like "Here is a summary..." or "Voici un résumé..."

"${pageText}"`;

      } else if (request.action === 'shrink') {
        if (!request.text) throw new Error('No text provided to shrink.');
        prompt = `Summarize the following text in ${language} in an even more concise way.
Make it as short as possible, using bullet points.
No need for filler text, or introductory sentence like "Here is a summary..." or "Voici un résumé..."

"${request.text}"`;
      } else {
        return;
      }

      await streamGeminiApi(apiKey, prompt);

    } catch (error) {
      console.error('Summarization Error:', error);
      chrome.runtime.sendMessage({ type: 'summaryError', error: error.message });
    }
  })();

  return true;
});

// Helper function to find the matching closing brace for a JSON object
function findMatchingBrace(str, start) {
  let depth = 1;
  for (let i = start + 1; i < str.length; i++) {
    if (str[i] === '{') {
      depth++;
    } else if (str[i] === '}') {
      depth--;
    }
    if (depth === 0) {
      return i;
    }
  }
  return -1; // Not found
}

async function streamGeminiApi(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let start;
    while ((start = buffer.indexOf('{')) !== -1) {
      const end = findMatchingBrace(buffer, start);
      if (end === -1) {
        break; // Incomplete JSON object, wait for more data
      }

      const jsonStr = buffer.substring(start, end + 1);
      buffer = buffer.substring(end + 1);

      try {
        const chunk = JSON.parse(jsonStr);
        const text = chunk.candidates[0]?.content?.parts[0]?.text;
        if (text) {
          chrome.runtime.sendMessage({ type: 'summaryChunk', chunk: text });
        }
      } catch (e) {
        // This is the new, important logging step
        console.error("--- FAILED TO PARSE STREAM CHUNK ---");
        console.error("Error:", e.message);
        console.error("Problematic JSON string:", jsonStr);
        console.error("--- END OF FAILED CHUNK ---");
      }
    }
  }

  chrome.runtime.sendMessage({ type: 'summaryComplete' });
}
