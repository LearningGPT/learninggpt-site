// Vercel serverless function for the LearningGPT playground
// Three modes:
//   POST { prompt, models }                          → runs all 5 models
//   POST { prompt, results, coach: true }            → playground coach analysis
//   POST { coach: true, lessonCoach: true, ... }     → per-lesson AI tutor

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured in Vercel.' });

  // ── LESSON COACH MODE ────────────────────────────────────────────────────────
  if (body.coach === true && body.lessonCoach === true) {
    const { lessonContext, history } = body;
    if (!lessonContext || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Missing lessonContext or history' });
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://learninggpt.ai',
          'X-Title': 'LearningGPT Lesson Coach'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-6',
          messages: [
            { role: 'system', content: lessonContext },
            ...history
          ],
          max_tokens: 400,
          temperature: 0.6
        })
      });

      const data = await response.json();
      const coach = data.choices?.[0]?.message?.content || null;
      return res.status(200).json({ coach });
    } catch (err) {
      return res.status(200).json({ coach: null });
    }
  }

  // ── PLAYGROUND COACH MODE ────────────────────────────────────────────────────
  if (body.coach === true) {
    const { prompt, results } = body;
    if (!prompt || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Missing prompt or results' });
    }

    const successful = results.filter(r => !r.error && r.response);
    if (successful.length < 2) return res.status(200).json({ coach: null });

    const context = successful.map(r => `### ${r.modelName}\n${r.response}`).join('\n\n');
    const coachPrompt = `You are an AI learning coach for LearningGPT.ai. A student ran this prompt across multiple AI models.

STUDENT'S PROMPT: "${prompt}"

MODEL RESPONSES:
${context}

1. Pick the strongest response and name the model clearly (e.g. "Claude wins this round")
2. In 2-3 sentences explain specifically WHY it won
3. In 1-2 sentences give a concrete actionable takeaway

Under 120 words. Direct and specific. Plain text only, no markdown symbols.`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://learninggpt.ai',
          'X-Title': 'LearningGPT Coach'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: coachPrompt }],
          max_tokens: 300,
          temperature: 0.5
        })
      });

      const data = await response.json();
      return res.status(200).json({ coach: data.choices?.[0]?.message?.content || null });
    } catch (err) {
      return res.status(200).json({ coach: null });
    }
  }

  // ── MODELS MODE ──────────────────────────────────────────────────────────────
  const { prompt, models } = body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  if (prompt.length > 4000) return res.status(400).json({ error: 'Prompt too long' });
  if (!Array.isArray(models) || models.length === 0 || models.length > 5) return res.status(400).json({ error: 'Invalid models array' });

  try {
    const promises = models.map(async (model) => {
      const startTime = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://learninggpt.ai',
            'X-Title': 'LearningGPT Playground'
          },
          body: JSON.stringify({
            model: model.id,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500,
            temperature: 0.7
          })
        });
        const data = await response.json();
        const elapsedMs = Date.now() - startTime;
        if (!response.ok || data.error) {
          return { modelId: model.id, modelName: model.name || model.id, response: '', tokens: 0, timeMs: elapsedMs, error: (data.error?.message || data.error) || ('HTTP ' + response.status) };
        }
        return { modelId: model.id, modelName: model.name || model.id, response: data.choices?.[0]?.message?.content || '', tokens: data.usage?.total_tokens || 0, timeMs: elapsedMs, error: null };
      } catch (err) {
        return { modelId: model.id, modelName: model.name || model.id, response: '', tokens: 0, timeMs: Date.now() - startTime, error: err.message };
      }
    });

    const results = await Promise.all(promises);
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
