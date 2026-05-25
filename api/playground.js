// Vercel serverless function for the LearningGPT playground
// Receives a prompt + list of models, fans out to OpenRouter, returns all responses + AI coach analysis.
//
// Required Vercel environment variable: OPENROUTER_API_KEY
// (Get yours at https://openrouter.ai/keys)

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Parse request body — Vercel sometimes leaves it as a string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { prompt, models } = body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "prompt" field' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Prompt too long (max 4000 characters)' });
  }
  if (!Array.isArray(models) || models.length === 0 || models.length > 5) {
    return res.status(400).json({ error: 'Invalid "models" array (must be 1-5 models)' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY environment variable not configured in Vercel. Add it under Project Settings → Environment Variables.'
    });
  }

  try {
    // Call all models in parallel
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
          return {
            modelId: model.id,
            modelName: model.name || model.id,
            response: '',
            tokens: 0,
            timeMs: elapsedMs,
            error: (data.error && (data.error.message || JSON.stringify(data.error))) || ('HTTP ' + response.status)
          };
        }

        return {
          modelId: model.id,
          modelName: model.name || model.id,
          response: data.choices?.[0]?.message?.content || '',
          tokens: data.usage?.total_tokens || 0,
          timeMs: elapsedMs,
          error: null
        };
      } catch (err) {
        return {
          modelId: model.id,
          modelName: model.name || model.id,
          response: '',
          tokens: 0,
          timeMs: Date.now() - startTime,
          error: err.message || 'Request failed'
        };
      }
    });

    const results = await Promise.all(promises);

    // Build AI Coach analysis using Claude via OpenRouter
    // Only run if we have at least 2 successful responses
    const successfulResults = results.filter(r => !r.error && r.response);
    let coach = null;

    if (successfulResults.length >= 2) {
      try {
        const coachContext = successfulResults.map(r =>
          `### ${r.modelName}\n${r.response}`
        ).join('\n\n');

        const coachPrompt = `You are an AI learning coach for LearningGPT.ai. A student just ran this prompt across multiple AI models and you need to help them learn from the comparison.

STUDENT'S PROMPT:
"${prompt}"

MODEL RESPONSES:
${coachContext}

Your job:
1. Pick the strongest response and name the model clearly (e.g. "Claude wins this round")
2. In 2-3 sentences explain specifically WHY it won — what technique, pattern, or approach made it better
3. In 1-2 sentences explain what the student should remember or try next time — a concrete, actionable takeaway

Keep it tight — under 120 words total. Be direct and specific. Don't be vague. Reference actual words or phrases from the winning response if it helps make the point. If responses are genuinely similar in quality, say so and explain what distinguishes them slightly.`;

        const coachResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://learninggpt.ai',
            'X-Title': 'LearningGPT Coach'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4.6',
            messages: [{ role: 'user', content: coachPrompt }],
            max_tokens: 300,
            temperature: 0.5
          })
        });

        const coachData = await coachResponse.json();

        if (coachResponse.ok && !coachData.error) {
          coach = coachData.choices?.[0]?.message?.content || null;
        }
      } catch (coachErr) {
        // Coach failure is non-fatal — results still return without it
        console.error('Coach error:', coachErr.message);
      }
    }

    return res.status(200).json({ results, coach });

  } catch (error) {
    console.error('Playground handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
