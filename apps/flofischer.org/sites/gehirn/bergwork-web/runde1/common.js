// Gemeinsame Teile der Konzepte: Werkzeichen-Icons, Linien-Symbole und die Texte der heutigen Seite.
import { werkzeichen } from './icons.js';

export const ICON = (id, tile = true) => werkzeichen(id, tile);

const P = {
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m4 4 16 16"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M5 21h14"/><path d="M4 4 20 20"/>',
  eye: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  down: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  win: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  task: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};
export const ico = (n, s = 20, w = 1.75) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

export const PRODUCTS = [
  { id: 'projects', name: 'Projects', c: '#2b6fc0', cd: '#79a8f5', head: 'Projects, not programs.', status: 'Test version 0.1.2', where: 'Windows and Linux', with: 'Microsoft 365',
    text: 'Pick a project on the left, and files, mail, tasks, chat, calendar, contacts and notes show only that project. The data stays in Outlook, OneDrive, SharePoint and Teams.', cta: 'Download' },
  { id: 'pdf', name: 'PDF', c: '#cc3b35', cd: '#f2716b', head: 'Move anything.', status: 'In your browser', where: 'Desktop app coming', with: 'Any PDF',
    text: 'Every line of text, every picture and every drawing is an object you can grab. Retype a word in the document’s own font, then save a normal PDF.', cta: 'Open in browser' },
  { id: 'image', name: 'Image Pro', c: '#2c8655', cd: '#62c690', head: 'Layers that stay loose.', status: 'In your browser', where: 'Desktop app coming', with: 'PNG, JPEG, WebP, PSD',
    text: 'Take a product out of its background on your own computer, drop it into a new scene and put text over it. Nothing is final until you export.', cta: 'Open in browser' },
];

export const TRUST = [
  ['cloud', 'No berg:work cloud', 'Projects shows your mail, files, chats and tasks from Microsoft 365 and leaves them there.'],
  ['upload', 'Nothing is uploaded', 'The PDF and image editors read your file in the browser and save it back to your disk.'],
  ['eye', 'No tracking', 'No analytics, no cookies, no third-party scripts – on this site, in the editors and in the app.'],
  ['cpu', 'AI on your machine', 'Background removal and subject selection run on your computer.'],
];

export function mount() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICON(el.dataset.icon, el.dataset.tile !== '0'); });
  document.querySelectorAll('[data-ico]').forEach((el) => { el.outerHTML = ico(el.dataset.ico, +(el.dataset.s || 20)); });
}
