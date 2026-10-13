// Convert mockup · entry: one page per sub-tool (today's six tabs), chosen by ?leaf= (tool or SEO preset).
import { resolvePage } from './common.js';
const ctx = resolvePage();
document.documentElement.dataset.cvTool = ctx.tool;
const file = { images: 'images', video: 'media', audio: 'media', data: 'data', tables: 'tables', documents: 'documents' }[ctx.tool];
const mod = await import(`./${file}.js`);
mod.init(ctx);
