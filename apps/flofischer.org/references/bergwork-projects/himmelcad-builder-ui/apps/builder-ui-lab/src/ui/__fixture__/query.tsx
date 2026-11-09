import { useState } from 'react';
import {
  Button,
  Fields,
  InlineInfo,
  InlineSelect,
  QueryConditions,
  QuerySaved,
  Sections,
  Surface,
  type QueryCondition,
  type QueryPatch,
} from '../index.js';

const TYPES = [
  {
    id: 'Points',
    label: 'Points',
    count: 16,
    children: [{ id: 'Points/Survey point', label: 'Survey points', count: 16 }],
  },
  {
    id: 'Lines',
    label: 'Lines',
    count: 7,
    children: [
      { id: 'Lines/Breakline', label: 'Breaklines', count: 2 },
      { id: 'Lines/Boundary', label: 'Boundaries', count: 1 },
    ],
  },
];
const SPECS = Array.from({ length: 12 }, (_, i) => ({
  id: String(4100 + i * 10),
  code: String(4100 + i * 10),
  label: `Kerb ${i + 1}`,
  count: i + 1,
}));

/** Select by criteria (proposal 2026-11-07): every row kind and its states. */
export function QueryFixture(): JSX.Element {
  const [rows, setRows] = useState<QueryCondition[]>([
    {
      id: 'type',
      key: 'type',
      label: 'Type',
      kind: 'set',
      options: TYPES,
      values: [],
      negate: false,
    },
    {
      id: 'spec',
      key: 'spec',
      label: 'Specification',
      kind: 'set',
      options: SPECS,
      values: ['4100', '4110'],
      negate: false,
    },
    {
      id: 'layer',
      key: 'layer',
      label: 'Layer',
      kind: 'set',
      options: [
        { id: 'Trees', label: 'Trees', count: 3 },
        { id: 'Kerb edge', label: 'Kerb edge', count: 13 },
      ],
      values: ['Trees'],
      negate: true,
    },
    {
      id: 'name',
      key: 'name',
      label: 'Name',
      kind: 'pattern',
      text: '',
      placeholder: '1001-1013',
      negate: false,
    },
    {
      id: 'height',
      key: 'height',
      label: 'Height',
      kind: 'range',
      min: '',
      max: '120.5',
      unit: 'm',
      match: 'between',
    },
    {
      id: 'inside',
      key: 'inside',
      label: 'Inside',
      kind: 'set',
      options: [{ id: 'b1', label: 'Boundary 1', count: 5 }],
      values: [],
      negate: false,
      matchLabels: ['Inside', 'Outside'],
      picking: 'Click an element',
    },
  ]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [enters, setEnters] = useState(0);
  const [loaded, setLoaded] = useState<string | null>('s1');
  const [saved, setSaved] = useState([
    { id: 's1', label: 'Kerb points', count: 13 },
    { id: 's2', label: 'Trees', count: 3 },
  ]);
  const change = (id: string, patch: QueryPatch) =>
    setRows(rows.map((r) => (r.id === id ? ({ ...r, ...patch } as QueryCondition) : r)));
  return (
    <div className="fx-col" data-t="query">
      <Surface kind="large">
        <Sections>
          <Fields step="Select by criteria">
            <QuerySaved
              saved={saved}
              loaded={loaded}
              changed
              onLoad={setLoaded}
              onSave={() => {
                setSaved([...saved, { id: 's3', label: 'Selection 3', count: 0 }]);
                return 's3';
              }}
              onUpdate={() => undefined}
              onRename={(id, label) =>
                setSaved(saved.map((s) => (s.id === id ? { ...s, label } : s)))
              }
              onDelete={(id) => {
                setSaved(saved.filter((s) => s.id !== id));
                setLoaded(null);
              }}
            />
            <InlineSelect
              label="Search in"
              options={[
                { id: 'selection', label: 'Selection', hint: '0', disabled: 'Nothing selected' },
                { id: 'visible', label: 'All visible', hint: '27' },
              ]}
              selected="visible"
              onChange={() => undefined}
            />
            <QueryConditions
              label="Conditions"
              conditions={rows.filter((r) => !removed.includes(r.id))}
              keys={[
                {
                  title: 'Element',
                  keys: [
                    { id: 'type', label: 'Type' },
                    { id: 'folder', label: 'Folder' },
                    {
                      id: 'attributes',
                      label: 'Attribute',
                      keys: [{ id: 'attr:Aufnehmer', label: 'Aufnehmer' }],
                    },
                  ],
                },
                {
                  title: 'Geometry',
                  keys: [
                    { id: 'height', label: 'Height' },
                    { id: 'inside2', label: 'Outside line' },
                  ],
                },
              ]}
              onChange={change}
              onAdd={(key) => setAdded([...added, key])}
              onRemove={(id) => setRemoved([...removed, id])}
              fromSelection={{ disabled: 'Nothing selected', onTake: () => undefined }}
              onPick={() => undefined}
              onEnter={() => setEnters(enters + 1)}
            />
            <InlineInfo label="Found" value="13 Survey points · 2 Breaklines" />
            <Button variant="primary" onClick={() => undefined}>
              Select 15
            </Button>
          </Fields>
        </Sections>
      </Surface>
      <div data-t="query-added" data-value={added.join(',')} />
      <div data-t="query-removed" data-value={removed.join(',')} />
      <div data-t="query-enters" data-value={enters} />
    </div>
  );
}
