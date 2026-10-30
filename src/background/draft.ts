// Calls Claude from the service worker with the user's own API key.
import Anthropic from '@anthropic-ai/sdk';
import { buildDraftPrompt, DRAFT_MODEL, fitToLimit, profileAsText, SYSTEM_PROMPT, type DraftRequest, type DraftResponse } from '../shared/ai';
import { companionSystemPrompt, type AskRequest } from '../shared/companion';
import { getAi, getProfile, getResumeText } from '../shared/storage';

export async function draftAnswer(req: DraftRequest): Promise<DraftResponse> {
  const [ai, profile, resumeText] = await Promise.all([getAi(), getProfile(), getResumeText()]);
  if (!ai.apiKey) return { ok: false, error: 'Add your Anthropic API key in Profile → AI drafts first.' };

  // The key belongs to the user and never leaves their browser except to the API.
  const client = new Anthropic({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
  try {
    const response = await client.beta.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // If a safety classifier declines, retry on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildDraftPrompt(req, resumeText, profile, ai.notes) }],
    });
    if (response.stop_reason === 'refusal') {
      return { ok: false, error: "Claude couldn't draft this one. Try rewording the question in your notes, or write it yourself." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) return { ok: false, error: 'Claude returned an empty draft. Try again.' };
    return { ok: true, text: fitToLimit(text, req.maxLength) };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Your API key was rejected. Check it in Profile → AI drafts.' };
    if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "Your API key doesn't have access to this model." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'Too many requests right now. Wait a minute and try again.' };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, error: `The request was rejected: ${err.message}` };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Could not reach the Anthropic API. Check your internet connection.' };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `Anthropic API error ${err.status ?? ''}: ${err.message}` };
    return { ok: false, error: String(err) };
  }
}

/** Cheap check that a key works, for the settings page. */
export async function testApiKey(apiKey: string): Promise<DraftResponse> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    await client.models.retrieve(DRAFT_MODEL);
    return { ok: true, text: 'Key works.' };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'That key was rejected.' };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `API error ${err.status ?? ''}: ${err.message}` };
    return { ok: false, error: String(err) };
  }
}

/** Companion chat. Only runs when the user has added an API key. */
export async function companionReply(req: AskRequest): Promise<DraftResponse> {
  const [ai, profile, resumeText] = await Promise.all([getAi(), getProfile(), getResumeText()]);
  if (!ai.apiKey) return { ok: false, error: 'AI chat is not connected. Add an API key in Settings → AI.' };
  const client = new Anthropic({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
  const about = `<about_user>\n${(resumeText || profileAsText(profile)).slice(0, 8000)}\n${ai.notes ? `\nNotes: ${ai.notes}` : ''}\n</about_user>\n<current_situation>\n${req.context}\n</current_situation>`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: about },
    { role: 'assistant', content: 'Got it. What would help right now?' },
    ...req.history.slice(-8).map((m) => ({ role: m.role, content: m.text }) as Anthropic.Beta.BetaMessageParam),
    { role: 'user', content: req.question },
  ];
  try {
    const response = await client.beta.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: companionSystemPrompt(req.personality),
      messages,
    });
    if (response.stop_reason === 'refusal') return { ok: false, error: "I can't help with that one. Try asking another way." };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text ? { ok: true, text } : { ok: false, error: 'No reply. Try again.' };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Your API key was rejected. Check it in Settings → AI.' };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'Too many requests. Wait a minute and try again.' };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Could not reach the Anthropic API.' };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `API error ${err.status ?? ''}: ${err.message}` };
    return { ok: false, error: String(err) };
  }
}
