export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY non configurée. Clé gratuite sur https://aistudio.google.com/apikey' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), { status: 400 });
  }

  const { place, type, tags = [], lang = 'français', style = 'détaillé avec anecdotes' } = body;

  if (!place) {
    return new Response(JSON.stringify({ error: 'Champ "place" requis' }), { status: 400 });
  }

  const tagsStr = tags.length ? `Mots-clés : ${tags.join(', ')}.` : '';

  const prompt = `Tu es un guide touristique expert et passionné. Rédige une présentation ${style} de "${place}" (type : ${type}) en ${lang}.

${tagsStr}

Inclus :
- L'histoire et l'origine du lieu
- Des anecdotes surprenantes ou méconnues
- Ce qu'il faut absolument voir ou savoir
- L'importance culturelle ou architecturale

Sois engageant, précis et vivant. Rédige en 2 à 3 paragraphes fluides. Ne mets pas de titre ni de liste à puces.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent?alt=sse&key=${apiKey}`;

  const geminiResponse = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 700,
        temperature: 0.8,
      },
    }),
  });

  if (!geminiResponse.ok) {
    const err = await geminiResponse.text();
    return new Response(
      JSON.stringify({ error: `Gemini API error ${geminiResponse.status}: ${err}` }),
      { status: geminiResponse.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  (async () => {
    const reader = geminiResponse.body.getReader();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const sseChunk = JSON.stringify({ type: 'content_block_delta', delta: { text } });
              await writer.write(encoder.encode(`data: ${sseChunk}\n\n`));
            }
          } catch {}
        }
      }
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
