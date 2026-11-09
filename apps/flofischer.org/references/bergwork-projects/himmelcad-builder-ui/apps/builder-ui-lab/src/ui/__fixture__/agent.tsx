import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Aperture, Asterisk, Search, Spline, SquareTerminal } from 'lucide-react';

import '@himmelcad/theme/fonts.css';
import '@himmelcad/theme/tokens.css';
import '@himmelcad/theme/reset.css';
import {
  ChatChanges,
  ChatStep,
  ChatTable,
  ChatThought,
  ChatWorkLog,
  Composer,
  ModelPicker,
  SessionGroup,
  SessionRow,
  SessionShelf,
  SettingsRow,
  SettingsSection,
  type ChatPromptSpec,
} from '../index.js';
import './fixture.css';

/**
 * The agent window's components (proposal round 6, UI-LIBRARY.md › Proposed: agent window) in
 * their states, for scripts/ui-lib-check.mjs › render. Each case sits in a `data-t` wrapper.
 */
const params = new URLSearchParams(location.search);
document.body.classList.add(params.get('theme') === 'light' ? 'hc-theme-light' : 'hc-theme-dark');

const noop = (): void => undefined;
const details = [
  ['Model', 'Opus 4.6 · High'],
  ['Started', 'Today 10:02'],
] as const;

const CHOICE: ChatPromptSpec = {
  kind: 'choice',
  topic: 'Schachtdeckel',
  question: 'Which candidates?',
  options: [
    { id: 'a', letter: 'A', label: 'Kreis Ø 0.62 m', hint: 'Station 0+041' },
    { id: 'b', letter: 'B', label: 'Kreis Ø 0.60 m' },
  ],
  onChoose: noop,
  onAnswer: noop,
};
const APPROVAL: ChatPromptSpec = {
  kind: 'approval',
  title: 'Export DXF',
  rows: [
    ['File', 'Lageplan.dxf'],
    ['Folder', 'D:\\Projekte\\2026\\Export'],
  ],
  onDeny: noop,
  onAllow: noop,
};

function Fixture(): JSX.Element {
  const [on, setOn] = useState(true);
  const [follow, setFollow] = useState('queue');
  const [open, setOpen] = useState(true);
  return (
    <div className="fx">
      <div className="fx-agent-side" data-t="ag-sessions">
        <SessionGroup label="Recent">
          <SessionRow
            title="Punktwolke Scan 3 klassifizieren und Kind-Wolken"
            state={{ kind: 'working', elapsed: '4:12' }}
            model="gpt-5.5"
            modelIcon={<Aperture size={12} />}
            changes={{ created: 0, undone: false }}
            details={details}
            onSelect={noop}
            onArchive={noop}
            onPin={noop}
          />
          <SessionRow
            title="Schachtdeckel"
            state={{ kind: 'waiting', what: 'Answer' }}
            model="gpt-5.5"
            modelIcon={<Aperture size={12} />}
            changes={{ created: 0, undone: false }}
            details={details}
            onSelect={noop}
            onArchive={noop}
          />
          <SessionRow
            title="Export Lageplan DXF"
            state={{ kind: 'failed' }}
            model="Opus 4.6"
            modelIcon={<Asterisk size={12} />}
            changes={{ created: 0, undone: false }}
            details={details}
            onSelect={noop}
            onArchive={noop}
          />
          <SessionRow
            title="Bericht Böschung Nord"
            state={{ kind: 'done' }}
            model="Opus 4.6"
            modelIcon={<Asterisk size={12} />}
            changes={{ created: 0, undone: false }}
            pinned
            details={details}
            onSelect={noop}
            onArchive={noop}
          />
          <SessionRow
            title="Kante RAND und Parallele"
            state={{ kind: 'idle', at: '2h' }}
            model="Opus 4.6"
            modelIcon={<Asterisk size={12} />}
            changes={{ created: 2, undone: false }}
            active
            details={details}
            onSelect={noop}
            onArchive={noop}
          />
        </SessionGroup>
        <SessionShelf label="Archived" count={1} open onToggle={noop}>
          <SessionRow
            title="DGM aus Scan 3"
            state={{ kind: 'idle', at: '4d' }}
            model="Opus 4.6"
            changes={{ created: 1, undone: true }}
            archived
            details={details}
            onSelect={noop}
            onArchive={noop}
          />
        </SessionShelf>
      </div>

      <div className="fx-agent-col" data-t="ag-settings">
        <SettingsSection
          title="New sessions"
          action={{ label: 'Look again', note: 'Checked 4 min ago', onClick: noop }}
        >
          <SettingsRow
            title="Model"
            hint="And its effort"
            control={{
              kind: 'button',
              label: 'Model',
              icon: <Asterisk size={16} />,
              value: 'Opus 4.6',
              detail: 'High',
              onClick: noop,
            }}
          />
          <SettingsRow
            title="Messages while it works"
            onReset={follow === 'queue' ? undefined : () => setFollow('queue')}
            control={{
              kind: 'select',
              value: follow,
              options: [
                ['queue', 'Queue'],
                ['steer', 'Steer'],
              ],
              onChange: setFollow,
            }}
          />
          <SettingsRow
            title="Access"
            control={{
              kind: 'select',
              value: 'change',
              options: [
                ['read', 'Read only'],
                ['ask', 'Ask before changes'],
                ['change', 'Change project'],
              ],
              onChange: noop,
            }}
          />
          <SettingsRow
            title="Notify me"
            hint="When it is done or waits for you"
            control={{ kind: 'check', checked: on, onChange: setOn }}
          />
          <SettingsRow title="Off" control={{ kind: 'check', checked: false, onChange: noop }} />
          <SettingsRow
            title="Program"
            control={{ kind: 'text', value: '~/.local/bin/claude', onCommit: noop }}
          />
          <SettingsRow
            title="Claude Code"
            icon={<Asterisk size={16} />}
            hint="2.1.283 · ~/.local/bin/claude"
            status={{ text: 'Signed in · claude.ai' }}
            control={{ kind: 'read', value: 'Asks' }}
          />
          <SettingsRow
            title="OpenCode"
            icon={<SquareTerminal size={16} />}
            status={{ text: 'Not installed', tone: 'quiet' }}
            dim
            control={{ kind: 'action', label: 'How to install', onClick: noop }}
          />
          <SettingsRow
            title="5 hours"
            status={{ text: 'Resets 14:20', tone: 'quiet' }}
            control={{ kind: 'meter', value: 0.34, text: '34 %' }}
          />
        </SettingsSection>
      </div>

      <div className="fx-agent-col" data-t="ag-work">
        <ChatWorkLog
          label="Worked for 1:48"
          summary="3 functions"
          open={open}
          onToggle={() => setOpen(!open)}
        >
          <ChatThought text="Die Böschung Nord hat eine Oberkante mit 13 Punkten; für den Längsschnitt nehme ich deren Stationierung und das DGM Bestand." />
          <ChatStep
            icon={<Search size={16} />}
            label="Find"
            value="13 points · RAND"
            state="done"
            params={[['Code', 'RAND']]}
            command='doc.find(code="RAND")'
          />
          <ChatStep icon={<Spline size={16} />} label="Polyline" value="Kante RAND" state="done" />
          <ChatStep icon={<Spline size={16} />} label="Parallel" value="3.250 m" state="running" />
          <ChatStep icon={<Spline size={16} />} label="Export" state="failed" error="Denied" />
        </ChatWorkLog>
        <ChatTable
          label="Heights"
          head={['Point', 'Station', 'Z']}
          numeric={[1, 2]}
          rows={[
            ['1001', '0+000.00', '412.180'],
            ['1002', '0+012.41', '412.495'],
            ['1013', '0+149.62', '416.600'],
          ]}
        />
        <ChatChanges
          label="2 changes"
          items={[
            {
              key: 'a',
              icon: <Spline size={16} />,
              name: 'Kante RAND',
              change: 'created',
              onSelect: noop,
            },
            {
              key: 'b',
              icon: <Spline size={16} />,
              name: 'Kante RAND +3.25',
              change: 'created',
              onSelect: noop,
            },
          ]}
          onSelectAll={noop}
          onUndo={noop}
        />
      </div>

      <div className="fx-agent-col" data-t="ag-choice">
        <Composer
          label="Message"
          placeholder="Ask the agent"
          value=""
          onChange={noop}
          onSend={noop}
          prompt={CHOICE}
        />
      </div>
      <div className="fx-agent-col" data-t="ag-approval">
        <Composer
          label="Message"
          placeholder="Ask the agent"
          value=""
          onChange={noop}
          onSend={noop}
          running
          onStop={noop}
          prompt={APPROVAL}
        />
      </div>

      <div className="fx-agent-picker" data-t="ag-picker-anchor">
        <ModelPicker
          label="Model"
          anchor={{ left: 900, right: 1000, top: 1200, bottom: 1220 }}
          providers={[
            {
              id: 'claude',
              label: 'Claude Code',
              icon: <Asterisk size={16} />,
              about: '2.1.283 · claude.ai',
              models: ['Opus 4.6', 'Sonnet 4.6'],
            },
            { id: 'codex', label: 'Codex', icon: <Aperture size={16} />, models: ['gpt-5.5'] },
            {
              id: 'open',
              label: 'OpenCode',
              icon: <SquareTerminal size={16} />,
              models: [],
              disabled: 'Not installed',
            },
          ]}
          favorites={['Opus 4.6']}
          efforts={['Low', 'Medium', 'High', 'Max']}
          value={{ provider: 'claude', model: 'Opus 4.6', effort: 'High' }}
          onChange={noop}
          onFavorite={noop}
          onSettings={noop}
          onClose={noop}
        />
      </div>
    </div>
  );
}

const root = document.getElementById('fixture');
if (!root) throw new Error('Missing #fixture');
createRoot(root).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
